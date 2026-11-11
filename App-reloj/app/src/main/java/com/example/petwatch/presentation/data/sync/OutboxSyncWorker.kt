package com.example.petwatch.presentation.data.sync

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.petwatch.presentation.appContainer
import com.example.petwatch.presentation.data.remote.DeviceCredentialRejectedException
import com.example.petwatch.presentation.data.remote.EdgeFunctionException
import com.example.petwatch.presentation.data.remote.IncidentPushRequest
import com.example.petwatch.presentation.data.remote.isNetworkError
import kotlinx.coroutines.CancellationException

/**
 * Sube los paseos (watch-walk-push) y los incidentes sueltos (watch-incident-push)
 * guardados en el reloj. Reintenta con backoff exponencial cuando no hay conexión
 * o el servidor falla; los rechazos definitivos no se reintentan.
 */
class OutboxSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val container = applicationContext.appContainer
        val outbox = container.outboxStore
        val client = container.edgeFunctionsClient
        // Sin credencial no se borra nada: se reintenta al volver a vincular.
        val credential = container.credentialStore.load() ?: return Result.failure()
        var retry = false

        for (walk in outbox.walks()) {
            when (val result = attempt { client.pushWalk(credential, walk.request) }) {
                is Attempt.Ok -> outbox.deleteWalk(walk.request.id)
                Attempt.Retry -> retry = true
                Attempt.CredentialInvalid -> return Result.failure()
                is Attempt.Rejected -> {
                    Log.w(TAG, "walk rejected code=${result.code}")
                    outbox.moveWalkToFailed(walk.request.id, result.message)
                    container.notifySyncProblem("Un paseo no se pudo guardar: ${result.message}")
                }
            }
        }

        for (chunk in outbox.incidents().chunked(MAX_INCIDENTS_PER_REQUEST)) {
            val ids = chunk.map { it.incident.id }
            when (val result = attempt {
                client.pushIncidents(credential, IncidentPushRequest(chunk.map { it.incident }))
            }) {
                is Attempt.Ok -> {
                    // insertados, existentes y rechazados ya no se reintentan.
                    if (result.value.rechazados.isNotEmpty()) {
                        container.notifySyncProblem(
                            "${result.value.rechazados.size} incidente(s) no se guardaron: la mascota ya no está en tus hogares."
                        )
                    }
                    outbox.deleteIncidents(ids)
                }
                Attempt.Retry -> retry = true
                Attempt.CredentialInvalid -> return Result.failure()
                is Attempt.Rejected -> {
                    Log.w(TAG, "incidents rejected code=${result.code}")
                    outbox.deleteIncidents(ids)
                    container.notifySyncProblem("Algunos incidentes no se pudieron guardar: ${result.message}")
                }
            }
        }

        return when {
            !retry -> Result.success()
            runAttemptCount >= MAX_ATTEMPTS -> Result.failure()
            else -> Result.retry()
        }
    }

    private sealed interface Attempt<out T> {
        data class Ok<T>(val value: T) : Attempt<T>
        data object Retry : Attempt<Nothing>
        data object CredentialInvalid : Attempt<Nothing>
        data class Rejected(val code: String, val message: String) : Attempt<Nothing>
    }

    private suspend fun <T> attempt(block: suspend () -> T): Attempt<T> = try {
        Attempt.Ok(block())
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (rejected: DeviceCredentialRejectedException) {
        Attempt.CredentialInvalid
    } catch (error: EdgeFunctionException) {
        if (error.isRetryable) {
            Attempt.Retry
        } else {
            Attempt.Rejected(error.errorCode, error.errorDetail ?: "error ${error.statusCode}")
        }
    } catch (error: Exception) {
        if (error.isNetworkError()) Attempt.Retry else Attempt.Rejected("client", error.javaClass.simpleName)
    }

    private companion object {
        const val TAG = "PetWatch"
        const val MAX_INCIDENTS_PER_REQUEST = 50
        const val MAX_ATTEMPTS = 30
    }
}
