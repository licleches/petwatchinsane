package com.example.petwatch.presentation.data.local

import android.content.Context
import com.example.petwatch.presentation.data.remote.IncidentDto
import com.example.petwatch.presentation.data.remote.WalkPushRequest
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable

@Serializable
data class OutboxWalk(
    val request: WalkPushRequest,
    val createdAtMillis: Long,
    /** Motivo si el servidor lo rechazó de forma definitiva. */
    val failedReason: String? = null
)

@Serializable
data class OutboxIncident(
    val incident: IncidentDto,
    val createdAtMillis: Long
)

data class OutboxCounts(
    val walks: Int = 0,
    val incidents: Int = 0,
    val failedWalks: Int = 0
) {
    val pending: Int get() = walks + incidents
}

/**
 * Paseos e incidentes guardados en el reloj hasta que el servidor los confirme.
 * Un archivo por elemento (nombre = UUID generado en el reloj), escrito de forma atómica.
 */
class OutboxStore(context: Context) {
    private val root = File(context.applicationContext.filesDir, "outbox")
    private val walksDir = File(root, "paseos")
    private val incidentsDir = File(root, "incidentes")
    private val failedDir = File(root, "rechazados")

    private val _counts = MutableStateFlow(OutboxCounts())
    val counts: StateFlow<OutboxCounts> = _counts.asStateFlow()

    init {
        refreshCounts()
    }

    @Synchronized
    fun saveWalk(walk: OutboxWalk) {
        JsonFiles.write(File(walksDir, fileName(walk.request.id)), walk)
        refreshCounts()
    }

    @Synchronized
    fun walks(): List<OutboxWalk> = readAll<OutboxWalk>(walksDir).sortedBy { it.createdAtMillis }

    @Synchronized
    fun deleteWalk(id: String) {
        JsonFiles.delete(File(walksDir, fileName(id)))
        refreshCounts()
    }

    @Synchronized
    fun moveWalkToFailed(id: String, reason: String) {
        val file = File(walksDir, fileName(id))
        val walk = JsonFiles.read<OutboxWalk>(file) ?: return
        JsonFiles.write(File(failedDir, fileName(id)), walk.copy(failedReason = reason))
        JsonFiles.delete(file)
        refreshCounts()
    }

    @Synchronized
    fun failedWalks(): List<OutboxWalk> = readAll<OutboxWalk>(failedDir).sortedBy { it.createdAtMillis }

    @Synchronized
    fun discardFailedWalks() {
        failedDir.listFiles()?.forEach { JsonFiles.delete(it) }
        refreshCounts()
    }

    @Synchronized
    fun saveIncident(incident: OutboxIncident) {
        JsonFiles.write(File(incidentsDir, fileName(incident.incident.id)), incident)
        refreshCounts()
    }

    @Synchronized
    fun incidents(): List<OutboxIncident> =
        readAll<OutboxIncident>(incidentsDir).sortedBy { it.createdAtMillis }

    @Synchronized
    fun deleteIncidents(ids: Collection<String>) {
        ids.forEach { JsonFiles.delete(File(incidentsDir, fileName(it))) }
        refreshCounts()
    }

    @Synchronized
    fun refreshCounts() {
        _counts.value = OutboxCounts(
            walks = countJson(walksDir),
            incidents = countJson(incidentsDir),
            failedWalks = countJson(failedDir)
        )
    }

    private inline fun <reified T> readAll(directory: File): List<T> =
        directory.listFiles { file -> file.name.endsWith(SUFFIX) }
            ?.mapNotNull { JsonFiles.read<T>(it) }
            .orEmpty()

    private fun countJson(directory: File): Int =
        directory.listFiles { file -> file.name.endsWith(SUFFIX) }?.size ?: 0

    private fun fileName(id: String): String {
        require(id.matches(SAFE_ID_REGEX)) { "Identificador inválido" }
        return "$id$SUFFIX"
    }

    private companion object {
        const val SUFFIX = ".json"
        val SAFE_ID_REGEX = Regex("[0-9a-fA-F-]{36}")
    }
}
