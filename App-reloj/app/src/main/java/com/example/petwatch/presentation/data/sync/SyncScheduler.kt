package com.example.petwatch.presentation.data.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

/** Trabajos de WorkManager: envío con reintentos cuando hay conexión. */
class SyncScheduler(context: Context) {
    private val appContext = context.applicationContext
    private val workManager: WorkManager
        get() = WorkManager.getInstance(appContext)

    private val networkConstraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    /** Envía una acción de tarea pendiente (una cola por tarea; la última gana). */
    fun enqueueTaskAction(taskId: String) {
        val request = OneTimeWorkRequestBuilder<TaskActionWorker>()
            .setInputData(workDataOf(TaskActionWorker.KEY_TASK_ID to taskId))
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
            .build()
        workManager.enqueueUniqueWork("$TASK_WORK_PREFIX$taskId", ExistingWorkPolicy.REPLACE, request)
    }

    /** Paseos e incidentes guardados en el reloj (outbox). */
    fun enqueueOutbox() {
        val request = OneTimeWorkRequestBuilder<OutboxSyncWorker>()
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
            .build()
        workManager.enqueueUniqueWork(OUTBOX_WORK, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    /** Refresca tareas y alarmas cada hora (cambios de otros miembros del hogar). */
    fun schedulePeriodicRefresh() {
        val request = PeriodicWorkRequestBuilder<TaskRefreshWorker>(1, TimeUnit.HOURS)
            .setConstraints(networkConstraints)
            .build()
        workManager.enqueueUniquePeriodicWork(REFRESH_WORK, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun enqueueRefreshNow() {
        val request = OneTimeWorkRequestBuilder<TaskRefreshWorker>()
            .setConstraints(networkConstraints)
            .build()
        workManager.enqueueUniqueWork(REFRESH_NOW_WORK, ExistingWorkPolicy.REPLACE, request)
    }

    fun cancelPeriodicRefresh() {
        workManager.cancelUniqueWork(REFRESH_WORK)
    }

    private companion object {
        const val BACKOFF_SECONDS = 30L
        const val TASK_WORK_PREFIX = "petwatch-tarea-"
        const val OUTBOX_WORK = "petwatch-outbox"
        const val REFRESH_WORK = "petwatch-refresco"
        const val REFRESH_NOW_WORK = "petwatch-refresco-ahora"
    }
}
