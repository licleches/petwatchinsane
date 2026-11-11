package com.example.petwatch.presentation.data.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.petwatch.presentation.appContainer
import com.example.petwatch.presentation.data.remote.DeviceCredentialRejectedException
import com.example.petwatch.presentation.data.remote.isNetworkError
import kotlinx.coroutines.CancellationException

/**
 * Refresca tareas y mascotas en segundo plano y reprograma las alarmas, para
 * que el reloj no suene por tareas que ya hizo otro miembro del hogar.
 */
class TaskRefreshWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val container = applicationContext.appContainer
        if (container.credentialStore.load() == null) return Result.success()
        return try {
            val tasks = container.taskRepository.refresh()
            container.onTasksLoaded(tasks.tasks)
            runCatching { container.petRepository.refresh() }
            Result.success()
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (rejected: DeviceCredentialRejectedException) {
            Result.success()
        } catch (error: Exception) {
            if (error.isNetworkError()) Result.retry() else Result.success()
        }
    }
}
