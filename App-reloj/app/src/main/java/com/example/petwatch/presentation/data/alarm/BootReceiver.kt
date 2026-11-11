package com.example.petwatch.presentation.data.alarm

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.example.petwatch.presentation.appContainer

/** Reprograma alarmas y trabajos al reiniciar el reloj, cambiar la hora o actualizar la app. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> {
                context.appContainer.onDeviceRestarted(
                    bootCompleted = intent.action == Intent.ACTION_BOOT_COMPLETED
                )
            }
        }
    }
}
