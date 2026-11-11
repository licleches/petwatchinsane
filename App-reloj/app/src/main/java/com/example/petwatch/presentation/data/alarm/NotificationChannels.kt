package com.example.petwatch.presentation.data.alarm

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.example.petwatch.R
import com.example.petwatch.presentation.MainActivity

/** Canales de notificación: alarmas de tareas, paseo en curso y sincronización. */
object NotificationChannels {
    const val ALARMS = "petwatch_tareas_v1"
    const val WALK = "petwatch_paseo_v1"
    const val SYNC = "petwatch_sync_v1"

    private const val SYNC_NOTIFICATION_ID = 7_001
    private const val TAG = "PetWatch"

    fun create(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val alarms = NotificationChannel(
            ALARMS,
            context.getString(R.string.channel_alarms_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = context.getString(R.string.channel_alarms_description)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 600, 300, 600, 300, 900)
            setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
        }
        val walk = NotificationChannel(
            WALK,
            context.getString(R.string.channel_walk_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = context.getString(R.string.channel_walk_description)
            setShowBadge(false)
        }
        val sync = NotificationChannel(
            SYNC,
            context.getString(R.string.channel_sync_name),
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = context.getString(R.string.channel_sync_description)
        }
        manager.createNotificationChannels(listOf(alarms, walk, sync))
    }

    fun canPostNotifications(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    @SuppressLint("MissingPermission")
    fun showSyncProblem(context: Context, message: String) {
        if (!canPostNotifications(context)) {
            Log.w(TAG, "sync problem not shown: notifications blocked")
            return
        }
        create(context)
        val openApp = PendingIntent.getActivity(
            context,
            SYNC_NOTIFICATION_ID,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = Notification.Builder(context, SYNC)
            .setSmallIcon(R.drawable.ic_pets)
            .setContentTitle("PetWatch no pudo sincronizar")
            .setContentText(message)
            .setStyle(Notification.BigTextStyle().bigText(message))
            .setContentIntent(openApp)
            .setAutoCancel(true)
            .build()
        runCatching {
            NotificationManagerCompat.from(context).notify(SYNC_NOTIFICATION_ID, notification)
        }
    }
}
