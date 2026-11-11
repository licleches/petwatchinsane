package com.example.petwatch.presentation.data.model

import kotlinx.serialization.Serializable

/** Tipos de incidente (mismos valores que incidentes.tipo en la base de datos). */
enum class IncidentType(val wire: String, val label: String, val emoji: String) {
    VOMITO("vomito", "Vómito", "🤮"),
    NO_COMIO("no_comio", "No comió", "🍽️"),
    COJEA("cojea", "Cojea", "🦴"),
    DIARREA("diarrea", "Diarrea", "💩"),
    PELEA("pelea", "Pelea", "💥"),
    OTRO("otro", "Otro", "❓");

    companion object {
        fun fromWire(value: String?): IncidentType? = entries.firstOrNull { it.wire == value }
    }
}

@Serializable
data class WalkIncident(
    val id: String,
    val petId: String,
    val type: String,
    val occurredAtMillis: Long,
    val lat: Double? = null,
    val lng: Double? = null
)

@Serializable
data class RoutePoint(
    val lat: Double,
    val lng: Double,
    /** Milisegundos desde epoch. */
    val t: Long
)

/** Paseo en curso. Se guarda en el reloj en cada cambio para sobrevivir al cierre de la app. */
@Serializable
data class WalkSession(
    val id: String,
    val petIds: List<String>,
    val petNames: List<String>,
    val householdId: String,
    val startedAtMillis: Long,
    val paused: Boolean = false,
    /** Health Services; si no está disponible solo se mide el tiempo. */
    val usesHealthServices: Boolean = true,
    val gpsEnabled: Boolean = false,
    /** Tiempo activo (sin pausas) en [checkpointAtMillis]. */
    val activeDurationMillis: Long = 0,
    val checkpointAtMillis: Long = startedAtMillis,
    val distanceMeters: Double? = null,
    val steps: Long? = null,
    val lastLat: Double? = null,
    val lastLng: Double? = null,
    val lastLocationAtMillis: Long? = null,
    val routePoints: Int = 0,
    val incidents: List<WalkIncident> = emptyList(),
    val updatedAtMillis: Long = startedAtMillis
) {
    fun activeDurationAt(nowMillis: Long): Long =
        if (paused) activeDurationMillis else activeDurationMillis + (nowMillis - checkpointAtMillis).coerceAtLeast(0)

    val petsLabel: String
        get() = petNames.joinToString(", ")
}

/** Resumen del último paseo terminado (pantalla de resumen). */
@Serializable
data class WalkSummary(
    val id: String,
    val petNames: List<String>,
    val startedAtMillis: Long,
    val endedAtMillis: Long,
    val activeSeconds: Long,
    val distanceMeters: Double? = null,
    val steps: Long? = null,
    val routePoints: Int = 0,
    val incidents: Int = 0
)
