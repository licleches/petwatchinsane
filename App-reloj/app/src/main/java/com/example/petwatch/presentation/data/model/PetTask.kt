package com.example.petwatch.presentation.data.model

import androidx.annotation.DrawableRes
import com.example.petwatch.R
import java.time.Instant

enum class CareType(val wire: String, val label: String, @DrawableRes val iconRes: Int) {
    COMIDA("comida", "Comida", R.drawable.ic_comida),
    MEDICAMENTO("medicamento", "Medicamento", R.drawable.ic_medicamento),
    PASEO("paseo", "Paseo", R.drawable.ic_paseo),
    OTRO("otro", "Otro", R.drawable.ic_otro);

    companion object {
        fun fromWire(value: String?): CareType = entries.firstOrNull { it.wire == value } ?: OTRO
    }
}

enum class TaskStatus(val wire: String, val label: String) {
    PENDIENTE("pendiente", "Pendiente"),
    HECHA("hecha", "Hecha"),
    POSPUESTA("pospuesta", "Pospuesta"),
    OMITIDA("omitida", "Omitida");

    val isFinal: Boolean
        get() = this == HECHA || this == OMITIDA

    companion object {
        fun fromWire(value: String?): TaskStatus = entries.firstOrNull { it.wire == value } ?: PENDIENTE
    }
}

enum class TaskAction(val status: TaskStatus) {
    DONE(TaskStatus.HECHA),
    POSTPONE(TaskStatus.POSPUESTA),
    SKIP(TaskStatus.OMITIDA)
}

val POSTPONE_OPTIONS = listOf(15, 30, 60, 120)

data class PetTask(
    val id: String,
    val householdId: String,
    val scheduledFor: Instant,
    val status: TaskStatus,
    val postponedUntil: Instant?,
    val doneAt: Instant?,
    val doneByName: String?,
    val petId: String,
    val petName: String,
    val petSpecies: String,
    val careType: CareType,
    val careName: String,
    val careDetail: String?,
    /** Acción hecha en el reloj que aún no llega al servidor. */
    val pendingSync: Boolean = false
) {
    /** Hora a la que toca atenderla: pospuesta_hasta si está pospuesta. */
    val effectiveAt: Instant
        get() = if (status == TaskStatus.POSPUESTA && postponedUntil != null) postponedUntil else scheduledFor

    val isOpen: Boolean
        get() = !status.isFinal
}

data class TasksData(
    val tasks: List<PetTask>,
    val fetchedAt: Instant,
    val fromCache: Boolean
)
