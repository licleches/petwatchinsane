package com.example.petwatch.presentation.data.repository

import android.content.Context
import com.example.petwatch.presentation.data.local.OutboxStore
import com.example.petwatch.presentation.data.local.OutboxWalk
import com.example.petwatch.presentation.data.local.WalkStore
import com.example.petwatch.presentation.data.model.IncidentType
import com.example.petwatch.presentation.data.model.Pet
import com.example.petwatch.presentation.data.model.RoutePoint
import com.example.petwatch.presentation.data.model.WalkIncident
import com.example.petwatch.presentation.data.model.WalkSession
import com.example.petwatch.presentation.data.model.WalkSummary
import com.example.petwatch.presentation.data.remote.IncidentDto
import com.example.petwatch.presentation.data.remote.RoutePointDto
import com.example.petwatch.presentation.data.remote.WalkPushRequest
import com.example.petwatch.presentation.data.sync.SyncScheduler
import com.example.petwatch.presentation.data.walk.RouteSimplifier
import com.example.petwatch.presentation.data.walk.WalkService
import com.example.petwatch.presentation.tile.PetWatchTileService
import com.example.petwatch.presentation.utils.toIsoMillis
import java.time.Instant
import java.util.UUID
import kotlin.math.roundToLong
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class GpsStatus { OFF, SEARCHING, READY, UNAVAILABLE }

/**
 * Estado del paseo en curso. Es el único que lo modifica (UI y WalkService),
 * y lo guarda en el reloj en cada cambio.
 */
class WalkRepository(
    context: Context,
    private val walkStore: WalkStore,
    private val outboxStore: OutboxStore,
    private val syncScheduler: SyncScheduler
) {
    private val appContext = context.applicationContext
    private val lock = Any()

    private val _session = MutableStateFlow(walkStore.load())
    val session: StateFlow<WalkSession?> = _session.asStateFlow()

    private val _lastSummary = MutableStateFlow(walkStore.loadSummary())
    val lastSummary: StateFlow<WalkSummary?> = _lastSummary.asStateFlow()

    private val _gpsStatus = MutableStateFlow(GpsStatus.OFF)
    val gpsStatus: StateFlow<GpsStatus> = _gpsStatus.asStateFlow()

    fun current(): WalkSession? = _session.value

    /** Crea el paseo y arranca el servicio en primer plano. Mascotas de un solo hogar. */
    fun start(pets: List<Pet>): WalkSession {
        require(pets.isNotEmpty())
        require(pets.map { it.householdId }.distinct().size == 1) { "Un paseo es de un solo hogar" }
        val session = synchronized(lock) {
            _session.value?.let { return it }
            val now = System.currentTimeMillis()
            val created = WalkSession(
                id = UUID.randomUUID().toString(),
                petIds = pets.map { it.id },
                petNames = pets.map { it.name },
                householdId = pets.first().householdId,
                startedAtMillis = now,
                checkpointAtMillis = now,
                updatedAtMillis = now
            )
            walkStore.clearSession()
            walkStore.save(created)
            _session.value = created
            created
        }
        _gpsStatus.value = GpsStatus.SEARCHING
        WalkService.start(appContext)
        PetWatchTileService.requestUpdate(appContext)
        return session
    }

    fun pause() = WalkService.sendAction(appContext, WalkService.ACTION_PAUSE)

    fun resume() = WalkService.sendAction(appContext, WalkService.ACTION_RESUME)

    fun finish() = WalkService.sendAction(appContext, WalkService.ACTION_FINISH)

    /** Si hay un paseo guardado y el servicio no corre (la app se cerró), lo reanuda. */
    fun restoreServiceIfNeeded() {
        if (_session.value != null) WalkService.restore(appContext)
    }

    fun mutate(transform: (WalkSession) -> WalkSession): WalkSession? = synchronized(lock) {
        val current = _session.value ?: return null
        val updated = transform(current).copy(updatedAtMillis = System.currentTimeMillis())
        walkStore.save(updated)
        _session.value = updated
        updated
    }

    fun appendRoute(points: List<RoutePoint>) {
        if (points.isEmpty()) return
        walkStore.appendRoute(points)
        val last = points.maxBy { it.t }
        mutate {
            it.copy(
                lastLat = last.lat,
                lastLng = last.lng,
                lastLocationAtMillis = last.t,
                routePoints = it.routePoints + points.size
            )
        }
    }

    fun setGpsStatus(status: GpsStatus) {
        _gpsStatus.value = status
    }

    /** Incidente durante el paseo: guarda la última ubicación y se envía con el paseo. */
    fun addIncident(petId: String, type: IncidentType): WalkIncident? {
        val incident = synchronized(lock) {
            val session = _session.value ?: return null
            if (petId !in session.petIds) return null
            val now = System.currentTimeMillis()
            val recentLocation = session.lastLocationAtMillis?.let { now - it <= LOCATION_MAX_AGE_MILLIS } == true
            WalkIncident(
                id = UUID.randomUUID().toString(),
                petId = petId,
                type = type.wire,
                occurredAtMillis = now,
                lat = if (recentLocation) session.lastLat else null,
                lng = if (recentLocation) session.lastLng else null
            )
        }
        mutate { it.copy(incidents = it.incidents + incident) }
        return incident
    }

    /**
     * Termina el paseo: reduce la ruta a 2000 puntos, lo guarda en el outbox y
     * pide a WorkManager que lo suba (con reintentos, aunque no haya conexión).
     */
    fun finalizeSession(endedAtMillis: Long = System.currentTimeMillis()): WalkSummary? = synchronized(lock) {
        val session = _session.value ?: return null
        val endedAt = endedAtMillis
            .coerceAtLeast(session.startedAtMillis)
            .coerceAtMost(session.startedAtMillis + MAX_WALK_MILLIS)
        val elapsedSeconds = (endedAt - session.startedAtMillis) / 1000
        val activeSeconds = (session.activeDurationAt(endedAt) / 1000).coerceIn(0, elapsedSeconds)
        val route = RouteSimplifier.simplify(walkStore.readRoute().filter { it.t <= endedAt + 60_000 })
        val request = WalkPushRequest(
            id = session.id,
            mascotaIds = session.petIds,
            iniciadoEn = Instant.ofEpochMilli(session.startedAtMillis).toIsoMillis(),
            terminadoEn = Instant.ofEpochMilli(endedAt).toIsoMillis(),
            duracionSeg = activeSeconds,
            distanciaM = session.distanceMeters?.let { (it * 10).roundToLong() / 10.0 },
            pasos = session.steps,
            ruta = route.map { RoutePointDto(it.lat, it.lng, it.t) },
            incidentes = session.incidents.map { incident ->
                IncidentDto(
                    id = incident.id,
                    mascotaId = incident.petId,
                    tipo = incident.type,
                    ocurridoEn = Instant.ofEpochMilli(incident.occurredAtMillis.coerceAtMost(endedAt)).toIsoMillis(),
                    lat = incident.lat,
                    lng = incident.lng
                )
            }
        )
        outboxStore.saveWalk(OutboxWalk(request, System.currentTimeMillis()))
        val summary = WalkSummary(
            id = session.id,
            petNames = session.petNames,
            startedAtMillis = session.startedAtMillis,
            endedAtMillis = endedAt,
            activeSeconds = activeSeconds,
            distanceMeters = session.distanceMeters,
            steps = session.steps,
            routePoints = route.size,
            incidents = session.incidents.size
        )
        walkStore.saveSummary(summary)
        walkStore.clearSession()
        _lastSummary.value = summary
        _session.value = null
        _gpsStatus.value = GpsStatus.OFF
        syncScheduler.enqueueOutbox()
        PetWatchTileService.requestUpdate(appContext)
        summary
    }

    private companion object {
        const val LOCATION_MAX_AGE_MILLIS = 2 * 60_000L
        const val MAX_WALK_MILLIS = 24 * 60 * 60_000L - 1_000L
    }
}
