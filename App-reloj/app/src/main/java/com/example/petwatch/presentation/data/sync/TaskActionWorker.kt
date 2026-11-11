package com.example.petwatch.presentation.data.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.petwatch.presentation.appContainer
import com.example.petwatch.presentation.data.repository.PendingSendResult

/** Envía a watch-task-update una acción hecha sin conexión o desde la alarma. */
class TaskActionWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val taskId = inputData.getString(KEY_TASK_ID) ?: return Result.failure()
        val container = applicationContext.appContainer
        return when (container.taskRepository.sendPending(taskId)) {
            PendingSendResult.DONE -> {
                container.onTasksChangedInBackground()
                Result.success()
            }
            PendingSendResult.RETRY -> if (runAttemptCount >= MAX_ATTEMPTS) Result.failure() else Result.retry()
            // La credencial se revocó: la acción se conserva y se reintenta al volver a vincular.
            PendingSendResult.CREDENTIAL_INVALID -> Result.failure()
        }
    }

    companion object {
        const val KEY_TASK_ID = "task_id"
        private const val MAX_ATTEMPTS = 20
    }
}
