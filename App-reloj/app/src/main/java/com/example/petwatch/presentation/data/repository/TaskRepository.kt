package com.example.petwatch.presentation.data.repository

import com.example.petwatch.presentation.data.local.CacheStore
import com.example.petwatch.presentation.data.local.DeviceCredentialStore
import com.example.petwatch.presentation.data.local.PendingTaskAction
import com.example.petwatch.presentation.data.local.PendingTaskActionStore
import com.example.petwatch.presentation.data.model.CareType
import com.example.petwatch.presentation.data.model.PetTask
import com.example.petwatch.presentation.data.model.TaskAction
import com.example.petwatch.presentation.data.model.TaskStatus
import com.example.petwatch.presentation.data.model.TasksData
import com.example.petwatch.presentation.data.remote.DeviceCredentialRejectedException
import com.example.petwatch.presentation.data.remote.EdgeFunctionException
import com.example.petwatch.presentation.data.remote.EdgeFunctionsClient
import com.example.petwatch.presentation.data.remote.TaskDto
import com.example.petwatch.presentation.data.remote.isNetworkError
import com.example.petwatch.presentation.data.sync.SyncScheduler
import com.example.petwatch.presentation.utils.parseInstant
import java.time.Instant
import kotlinx.coroutines.CancellationException

enum class ActionOutcome {
    /** El servidor ya guardó el cambio. */
    SENT,

    /** Sin conexión: se guardó en el reloj y WorkManager lo enviará después. */
    QUEUED
}

enum class PendingSendResult { DONE, RETRY, CREDENTIAL_INVALID }

/** Tareas de hoy (watch-tasks-list) y cambios de estado (watch-task-update). */
class TaskRepository(
    private val client: EdgeFunctionsClient,
    private val credentialStore: DeviceCredentialStore,
    private val cacheStore: CacheStore,
    private val pendingActions: PendingTaskActionStore,
    private val syncScheduler: SyncScheduler
) {
    suspend fun refresh(): TasksData {
        val credential = credentialStore.load() ?: throw DeviceCredentialRejectedException()
        val response = client.listTasks(credential)
        val now = Instant.now()
        cacheStore.saveTasks(response, now)
        return TasksData(merge(response.tareas.mapNotNull(::toTask)), now, fromCache = false)
    }

    fun cached(): TasksData? = cacheStore.loadTasks()?.let { cached ->
        TasksData(
            tasks = merge(cached.data.tareas.mapNotNull(::toTask)),
            fetchedAt = Instant.ofEpochMilli(cached.fetchedAtMillis),
            fromCache = true
        )
    }

    /**
     * Aplica la acción en el servidor. Sin conexión (o con el servidor caído) la
     * guarda para que WorkManager la envíe después. Errores definitivos
     * (404, 409, ...) se propagan para mostrarlos.
     */
    suspend fun apply(taskId: String, action: TaskAction, postponeMinutes: Int?): ActionOutcome {
        val credential = credentialStore.load() ?: throw DeviceCredentialRejectedException()
        val minutes = if (action == TaskAction.POSTPONE) postponeMinutes else null
        try {
            val response = client.updateTask(credential, taskId, action.status.wire, minutes)
            pendingActions.remove(taskId)
            response.tarea?.let(cacheStore::replaceTask)
            return ActionOutcome.SENT
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (rejected: DeviceCredentialRejectedException) {
            throw rejected
        } catch (error: EdgeFunctionException) {
            if (!error.isRetryable) throw error
        } catch (error: Exception) {
            if (!error.isNetworkError()) throw error
        }
        enqueue(taskId, action, minutes)
        return ActionOutcome.QUEUED
    }

    /** Guarda la acción para enviarla con WorkManager (alarma o sin conexión). */
    fun enqueue(taskId: String, action: TaskAction, postponeMinutes: Int?) {
        pendingActions.put(
            PendingTaskAction(
                taskId = taskId,
                status = action.status.wire,
                postponeMinutes = if (action == TaskAction.POSTPONE) postponeMinutes else null,
                createdAtMillis = System.currentTimeMillis()
            )
        )
        syncScheduler.enqueueTaskAction(taskId)
    }

    fun pendingTaskIds(): Set<String> = pendingActions.all().keys

    /** Envía una acción pendiente (TaskActionWorker). */
    suspend fun sendPending(taskId: String): PendingSendResult {
        val action = pendingActions.get(taskId) ?: return PendingSendResult.DONE
        if (action.status == TaskStatus.POSPUESTA.wire) {
            // Una posposición que ya venció no se envía: la alarma local ya volvió a sonar.
            val minutes = action.postponeMinutes ?: 0
            if (System.currentTimeMillis() >= action.createdAtMillis + minutes * 60_000L) {
                pendingActions.remove(taskId)
                return PendingSendResult.DONE
            }
        }
        val credential = credentialStore.load() ?: return PendingSendResult.CREDENTIAL_INVALID
        return try {
            val response = client.updateTask(credential, taskId, action.status, action.postponeMinutes)
            pendingActions.remove(taskId)
            response.tarea?.let(cacheStore::replaceTask)
            PendingSendResult.DONE
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (rejected: DeviceCredentialRejectedException) {
            PendingSendResult.CREDENTIAL_INVALID
        } catch (error: EdgeFunctionException) {
            if (error.isRetryable) {
                PendingSendResult.RETRY
            } else {
                // 404 / 409: alguien más la resolvió o ya no existe. No se reintenta.
                pendingActions.remove(taskId)
                PendingSendResult.DONE
            }
        } catch (error: Exception) {
            if (error.isNetworkError()) {
                PendingSendResult.RETRY
            } else {
                pendingActions.remove(taskId)
                PendingSendResult.DONE
            }
        }
    }

    /** Muestra las acciones aún no enviadas encima de los datos del servidor. */
    private fun merge(tasks: List<PetTask>): List<PetTask> {
        val pending = pendingActions.all()
        if (pending.isEmpty()) return tasks
        return tasks.map { task ->
            val action = pending[task.id] ?: return@map task
            if (task.status.isFinal) return@map task
            val status = TaskStatus.fromWire(action.status)
            task.copy(
                status = status,
                postponedUntil = if (status == TaskStatus.POSPUESTA) {
                    Instant.ofEpochMilli(action.createdAtMillis + (action.postponeMinutes ?: 0) * 60_000L)
                } else {
                    null
                },
                doneAt = if (status.isFinal) Instant.ofEpochMilli(action.createdAtMillis) else null,
                pendingSync = true
            )
        }
    }

    private fun toTask(dto: TaskDto): PetTask? {
        val scheduledFor = parseInstant(dto.programadaPara) ?: return null
        return PetTask(
            id = dto.id,
            householdId = dto.hogarId,
            scheduledFor = scheduledFor,
            status = TaskStatus.fromWire(dto.estado),
            postponedUntil = parseInstant(dto.pospuestaHasta),
            doneAt = parseInstant(dto.hechaEn),
            doneByName = dto.hechaPor?.nombre,
            petId = dto.mascota.id,
            petName = dto.mascota.nombre,
            petSpecies = dto.mascota.especie,
            careType = CareType.fromWire(dto.cuidado.tipo),
            careName = dto.cuidado.nombre,
            careDetail = dto.cuidado.detalle
        )
    }
}
