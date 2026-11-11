package com.example.petwatch.presentation.data.alarm

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.example.petwatch.R
import com.example.petwatch.presentation.ui.alarm.TaskAlarmActivity

/** Notificación de alarma con pantalla completa y acciones directas. */
object AlarmNotificationManager {
    private const val TAG = "PetWatch"
    private const val TIMEOUT_MILLIS = 10 * 60_000L

    @SuppressLint("MissingPermission")
    fun showTaskAlarm(context: Context, alarm: AlarmRecord) {
        if (!NotificationChannels.canPostNotifications(context)) {
            Log.w(TAG, "NOTIFICATION_BLOCKED reason=permission")
            return
        }
        NotificationChannels.create(context)
        val fullScreen = alarmActivityIntent(context, alarm)
        val notification = Notification.Builder(context, NotificationChannels.ALARMS)
            .setSmallIcon(R.drawable.ic_pets)
            .setContentTitle("${alarm.petName}: ${alarm.careName}")
            .setContentText("Programada para las ${alarm.timeLabel}")
            .setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setTimeoutAfter(TIMEOUT_MILLIS)
            .setContentIntent(fullScreen)
            .setFullScreenIntent(fullScreen, true)
            .addAction(
                Notification.Action.Builder(
                    Icon.createWithResource(context, R.drawable.ic_check),
                    "Hecha",
                    actionIntent(context, TaskAlarmScheduler.ACTION_DONE, alarm.taskId)
                ).build()
            )
            .addAction(
                Notification.Action.Builder(
                    Icon.createWithResource(context, R.drawable.ic_snooze),
                    "+15 min",
                    actionIntent(context, TaskAlarmScheduler.ACTION_POSTPONE, alarm.taskId, 15)
                ).build()
            )
            .build()
        try {
            NotificationManagerCompat.from(context).notify(notificationId(alarm.taskId), notification)
            Log.i(TAG, "ALARM_NOTIFICATION_POSTED")
        } catch (securityException: SecurityException) {
            Log.e(TAG, "NOTIFICATION_BLOCKED reason=security_exception", securityException)
        }
    }

    fun cancel(context: Context, taskId: String) {
        NotificationManagerCompat.from(context).cancel(notificationId(taskId))
    }

    fun notificationId(taskId: String): Int = 10_000 + (TaskAlarmScheduler.requestCode(taskId) % 1_000_000)

    fun actionIntent(
        context: Context,
        action: String,
        taskId: String,
        postponeMinutes: Int? = null
    ): PendingIntent {
        val intent = Intent(context, TaskAlarmActionReceiver::class.java).apply {
            this.action = action
            putExtra(TaskAlarmScheduler.EXTRA_TASK_ID, taskId)
            postponeMinutes?.let { putExtra(TaskAlarmScheduler.EXTRA_POSTPONE_MINUTES, it) }
        }
        return PendingIntent.getBroadcast(
            context,
            TaskAlarmScheduler.requestCode(taskId) xor action.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun alarmActivityIntent(context: Context, alarm: AlarmRecord): PendingIntent {
        val intent = Intent(context, TaskAlarmActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(TaskAlarmScheduler.EXTRA_TASK_ID, alarm.taskId)
            putExtra(TaskAlarmScheduler.EXTRA_PET_NAME, alarm.petName)
            putExtra(TaskAlarmScheduler.EXTRA_CARE_NAME, alarm.careName)
            putExtra(TaskAlarmScheduler.EXTRA_CARE_TYPE, alarm.careType)
            putExtra(TaskAlarmScheduler.EXTRA_TIME_LABEL, alarm.timeLabel)
        }
        return PendingIntent.getActivity(
            context,
            TaskAlarmScheduler.requestCode(alarm.taskId),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
