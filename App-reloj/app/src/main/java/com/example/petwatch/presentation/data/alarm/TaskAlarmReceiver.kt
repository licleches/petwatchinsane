package com.example.petwatch.presentation.data.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.example.petwatch.presentation.appContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Suena la alarma de una tarea. Antes revisa (máximo 4 s) si alguien del hogar
 * ya la hizo o la pospuso; sin conexión, suena con los datos guardados.
 */
class TaskAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TaskAlarmScheduler.ACTION_FIRE) return
        val alarm = intent.toAlarmRecord() ?: return
        val pendingResult = goAsync()
        val appContext = context.applicationContext
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val container = appContext.appContainer
                container.alarmScheduler.markFired(alarm.taskId)
                val tasks = withTimeoutOrNull(CHECK_TIMEOUT_MILLIS) {
                    runCatching { container.taskRepository.refresh().tasks }.getOrNull()
                } ?: container.taskRepository.cached()?.tasks
                val task = tasks?.firstOrNull { it.id == alarm.taskId }
                val stillDue = task == null ||
                    (task.isOpen && task.effectiveAt.toEpochMilli() <= System.currentTimeMillis() + GRACE_MILLIS)
                if (stillDue) {
                    Log.i(TAG, "ALARM_TRIGGERED")
                    AlarmNotificationManager.showTaskAlarm(appContext, alarm)
                } else {
                    Log.i(TAG, "ALARM_SKIPPED reason=resolved_or_moved")
                }
                if (tasks != null) container.onTasksLoaded(tasks)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun Intent.toAlarmRecord(): AlarmRecord? {
        val taskId = getStringExtra(TaskAlarmScheduler.EXTRA_TASK_ID) ?: return null
        return AlarmRecord(
            taskId = taskId,
            triggerAtMillis = System.currentTimeMillis(),
            petName = getStringExtra(TaskAlarmScheduler.EXTRA_PET_NAME).orEmpty(),
            careName = getStringExtra(TaskAlarmScheduler.EXTRA_CARE_NAME).orEmpty(),
            careType = getStringExtra(TaskAlarmScheduler.EXTRA_CARE_TYPE).orEmpty(),
            timeLabel = getStringExtra(TaskAlarmScheduler.EXTRA_TIME_LABEL).orEmpty()
        )
    }

    private companion object {
        const val TAG = "PetWatch"
        const val CHECK_TIMEOUT_MILLIS = 4_000L
        const val GRACE_MILLIS = 60_000L
    }
}
