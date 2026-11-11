package com.example.petwatch.presentation.utils

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/** Vibración corta para confirmar una acción sin mirar la pantalla. */
object Haptics {
    fun confirm(context: Context) {
        vibrate(context, VibrationEffect.createWaveform(longArrayOf(0, 60, 80, 60), -1))
    }

    fun reject(context: Context) {
        vibrate(context, VibrationEffect.createOneShot(250, VibrationEffect.DEFAULT_AMPLITUDE))
    }

    private fun vibrate(context: Context, effect: VibrationEffect) {
        val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Vibrator::class.java)
        }
        runCatching { vibrator?.takeIf { it.hasVibrator() }?.vibrate(effect) }
    }
}
