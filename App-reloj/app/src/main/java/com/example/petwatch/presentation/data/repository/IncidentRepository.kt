package com.example.petwatch.presentation.data.repository

import com.example.petwatch.presentation.data.local.OutboxIncident
import com.example.petwatch.presentation.data.local.OutboxStore
import com.example.petwatch.presentation.data.model.IncidentType
import com.example.petwatch.presentation.data.remote.IncidentDto
import com.example.petwatch.presentation.data.sync.SyncScheduler
import com.example.petwatch.presentation.utils.toIsoMillis
import java.time.Instant
import java.util.UUID

enum class IncidentResult {
    /** Guardado en el paseo en curso, con ubicación; se envía junto con el paseo. */
    IN_WALK,

    /** En cola; WorkManager lo envía a watch-incident-push al tener conexión. */
    QUEUED
}

/** Incidente rápido. El UUID se genera en el reloj para que un reintento no lo duplique. */
class IncidentRepository(
    private val walkRepository: WalkRepository,
    private val outboxStore: OutboxStore,
    private val syncScheduler: SyncScheduler
) {
    fun record(petId: String, type: IncidentType): IncidentResult {
        val session = walkRepository.current()
        if (session != null && petId in session.petIds && walkRepository.addIncident(petId, type) != null) {
            return IncidentResult.IN_WALK
        }
        val now = System.currentTimeMillis()
        outboxStore.saveIncident(
            OutboxIncident(
                incident = IncidentDto(
                    id = UUID.randomUUID().toString(),
                    mascotaId = petId,
                    tipo = type.wire,
                    ocurridoEn = Instant.ofEpochMilli(now).toIsoMillis()
                ),
                createdAtMillis = now
            )
        )
        syncScheduler.enqueueOutbox()
        return IncidentResult.QUEUED
    }
}
