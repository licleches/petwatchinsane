package com.example.petwatch.presentation

import android.content.Context
import com.example.petwatch.presentation.data.alarm.NotificationChannels
import com.example.petwatch.presentation.data.alarm.TaskAlarmScheduler
import com.example.petwatch.presentation.data.local.CacheStore
import com.example.petwatch.presentation.data.local.DeviceCredentialStore
import com.example.petwatch.presentation.data.local.OutboxStore
import com.example.petwatch.presentation.data.local.PendingTaskActionStore
import com.example.petwatch.presentation.data.local.WalkStore
import com.example.petwatch.presentation.data.repository.IncidentRepository
import com.example.petwatch.presentation.data.repository.WalkRepository
import com.example.petwatch.presentation.data.model.PetTask
import com.example.petwatch.presentation.data.remote.EdgeFunctionsClient
import com.example.petwatch.presentation.data.repository.PairingRepository
import com.example.petwatch.presentation.data.repository.PetRepository
import com.example.petwatch.presentation.data.repository.TaskRepository
import com.example.petwatch.presentation.data.sync.SyncScheduler

/** Dependencias compartidas de la app (sin framework de inyección, como MedTime). */
class AppContainer(context: Context) {
    private val appContext = context.applicationContext

    val edgeFunctionsClient by lazy { EdgeFunctionsClient(appContext) }
    val credentialStore by lazy { DeviceCredentialStore(appContext) }
    val cacheStore by lazy { CacheStore(appContext) }
    val pendingTaskActions by lazy { PendingTaskActionStore(appContext) }
    val outboxStore by lazy { OutboxStore(appContext) }
    val syncScheduler by lazy { SyncScheduler(appContext) }

    val pairingRepository by lazy {
        PairingRepository(
            client = edgeFunctionsClient,
            credentialStore = credentialStore,
            onPaired = ::onPaired,
            onCredentialCleared = ::onCredentialCleared
        )
    }
    val petRepository by lazy { PetRepository(edgeFunctionsClient, credentialStore, cacheStore) }
    val taskRepository by lazy {
        TaskRepository(edgeFunctionsClient, credentialStore, cacheStore, pendingTaskActions, syncScheduler)
    }

    val alarmScheduler by lazy { TaskAlarmScheduler(appContext) }
    val walkStore by lazy { WalkStore(appContext) }
    val walkRepository by lazy { WalkRepository(appContext, walkStore, outboxStore, syncScheduler) }
    val incidentRepository by lazy { IncidentRepository(walkRepository, outboxStore, syncScheduler) }

    fun onAppStart() {
        NotificationChannels.create(appContext)
        if (credentialStore.load() != null) {
            syncScheduler.schedulePeriodicRefresh()
            if (outboxStore.counts.value.pending > 0) syncScheduler.enqueueOutbox()
        }
    }

    /** Hay una lista nueva de tareas (servidor o caché): reprograma las alarmas. */
    fun onTasksLoaded(tasks: List<PetTask>) {
        alarmScheduler.reschedule(tasks)
    }

    /** Reinicio del reloj, cambio de hora o permiso de alarmas exactas. */
    fun onDeviceRestarted(bootCompleted: Boolean) {
        alarmScheduler.restore()
        if (bootCompleted) {
            // El ejercicio no sobrevive al reinicio: se guarda el paseo con lo registrado.
            walkRepository.current()?.let { session ->
                walkRepository.finalizeSession(endedAtMillis = session.updatedAtMillis)
            }
        }
        if (credentialStore.load() == null) return
        syncScheduler.schedulePeriodicRefresh()
        syncScheduler.enqueueRefreshNow()
        if (outboxStore.counts.value.pending > 0) syncScheduler.enqueueOutbox()
        taskRepository.pendingTaskIds().forEach(syncScheduler::enqueueTaskAction)
    }

    /** Un worker cambió tareas sin la UI abierta. */
    fun onTasksChangedInBackground() {
        taskRepository.cached()?.let { onTasksLoaded(it.tasks) }
    }

    fun notifySyncProblem(message: String) {
        NotificationChannels.showSyncProblem(appContext, message)
    }

    private fun onPaired() {
        syncScheduler.schedulePeriodicRefresh()
        syncScheduler.enqueueOutbox()
        taskRepository.pendingTaskIds().forEach(syncScheduler::enqueueTaskAction)
    }

    private fun onCredentialCleared() {
        cacheStore.clear()
        alarmScheduler.cancelAll()
        syncScheduler.cancelPeriodicRefresh()
    }
}
