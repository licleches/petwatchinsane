package com.example.petwatch.presentation.data.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.example.petwatch.presentation.appContainer
import com.example.petwatch.presentation.data.model.POSTPONE_OPTIONS
import com.example.petwatch.presentation.data.model.TaskAction
import com.example.petwatch.presentation.utils.Haptics
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Acciones de la alarma (notificación o pantalla completa). La acción se guarda
 * en el reloj y la envía TaskActionWorker con reintentos, así funciona sin conexión.
 */
class TaskAlarmActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val taskId = intent.getStringExtra(TaskAlarmScheduler.EXTRA_TASK_ID) ?: return
        val action = when (intent.action) {
            TaskAlarmScheduler.ACTION_DONE -> TaskAction.DONE
            TaskAlarmScheduler.ACTION_POSTPONE -> TaskAction.POSTPONE
            TaskAlarmScheduler.ACTION_SKIP -> TaskAction.SKIP
            TaskAlarmScheduler.ACTION_SILENCE -> null
            else -> return
        }
        val appContext = context.applicationContext
        AlarmNotificationManager.cancel(appContext, taskId)
        if (action == null) return

        val minutes = intent.getIntExtra(TaskAlarmScheduler.EXTRA_POSTPONE_MINUTES, DEFAULT_POSTPONE)
            .takeIf { it in POSTPONE_OPTIONS } ?: DEFAULT_POSTPONE
        val pendingResult = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val container = appContext.appContainer
                container.alarmScheduler.cancel(taskId)
                container.taskRepository.enqueue(
                    taskId = taskId,
                    action = action,
                    postponeMinutes = if (action == TaskAction.POSTPONE) minutes else null
                )
                // Con la acción en cola, una posposición vuelve a programar su alarma.
                container.onTasksChangedInBackground()
                Haptics.confirm(appContext)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private companion object {
        const val DEFAULT_POSTPONE = 15
    }
}
