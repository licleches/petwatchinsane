package com.example.petwatch.presentation.data.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import com.example.petwatch.presentation.data.local.JsonFiles
import com.example.petwatch.presentation.data.model.PetTask
import com.example.petwatch.presentation.utils.formatTime
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString

@Serializable
data class AlarmRecord(
    val taskId: String,
    val triggerAtMillis: Long,
    val petName: String,
    val careName: String,
    val careType: String,
    val timeLabel: String
)

/**
 * Alarmas exactas para las tareas pendientes (adaptado de DoseAlarmScheduler de
 * MedTime). Los registros se guardan para reprogramarlas al reiniciar el reloj.
 */
class TaskAlarmScheduler(context: Context) {
    private val appContext = context.applicationContext
    private val alarmManager = appContext.getSystemService(AlarmManager::class.java)
    private val store = AlarmScheduleStore(appContext)

    /** Programa las tareas abiertas futuras y cancela las que ya no aplican. */
    @Synchronized
    fun reschedule(tasks: List<PetTask>) {
        val now = System.currentTimeMillis()
        val records = tasks.asSequence()
            .filter { it.isOpen }
            .map { it.toAlarmRecord() }
            .filter { it.triggerAtMillis > now }
            .distinctBy(AlarmRecord::taskId)
            .sortedBy(AlarmRecord::triggerAtMillis)
            .take(MAX_ALARMS)
            .toList()
        val previous = store.load()
        previous.filter { old -> records.none { it.taskId == old.taskId } }.forEach(::cancelRecord)
        store.save(records)
        records.forEach(::scheduleRecord)
        Log.d(TAG, "alarms rescheduled count=${records.size}")
    }

    /** Después de reiniciar o de un cambio de hora: vuelve a programar lo guardado. */
    @Synchronized
    fun restore() {
        val now = System.currentTimeMillis()
        val records = store.load().filter { it.triggerAtMillis > now }.distinctBy(AlarmRecord::taskId)
        store.save(records)
        records.forEach(::scheduleRecord)
        Log.d(TAG, "alarms restored count=${records.size}")
    }

    @Synchronized
    fun cancel(taskId: String) {
        val records = store.load()
        records.firstOrNull { it.taskId == taskId }?.let(::cancelRecord)
        store.save(records.filterNot { it.taskId == taskId })
    }

    /** La alarma ya sonó: se quita del registro. */
    @Synchronized
    fun markFired(taskId: String) {
        store.save(store.load().filterNot { it.taskId == taskId })
    }

    @Synchronized
    fun cancelAll() {
        store.load().forEach(::cancelRecord)
        store.save(emptyList())
    }

    fun canScheduleExactAlarms(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()

    private fun scheduleRecord(record: AlarmRecord) {
        if (record.triggerAtMillis <= System.currentTimeMillis()) return
        val pendingIntent = alarmPendingIntent(record)
        try {
            if (canScheduleExactAlarms()) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, record.triggerAtMillis, pendingIntent)
            } else {
                Log.w(TAG, "ALARM_PERMISSION_MISSING; using inexact alarm")
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, record.triggerAtMillis, pendingIntent)
            }
        } catch (securityException: SecurityException) {
            Log.w(TAG, "ALARM_PERMISSION_MISSING; using inexact alarm")
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, record.triggerAtMillis, pendingIntent)
        }
    }

    private fun cancelRecord(record: AlarmRecord) {
        alarmManager.cancel(alarmPendingIntent(record))
    }

    private fun alarmPendingIntent(record: AlarmRecord): PendingIntent {
        val intent = Intent(appContext, TaskAlarmReceiver::class.java).apply {
            action = ACTION_FIRE
            data = Uri.parse("petwatch://tarea/${record.taskId}")
            putExtra(EXTRA_TASK_ID, record.taskId)
            putExtra(EXTRA_PET_NAME, record.petName)
            putExtra(EXTRA_CARE_NAME, record.careName)
            putExtra(EXTRA_CARE_TYPE, record.careType)
            putExtra(EXTRA_TIME_LABEL, record.timeLabel)
        }
        return PendingIntent.getBroadcast(
            appContext,
            requestCode(record.taskId),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun PetTask.toAlarmRecord(): AlarmRecord = AlarmRecord(
        taskId = id,
        triggerAtMillis = effectiveAt.toEpochMilli(),
        petName = petName,
        careName = careName,
        careType = careType.wire,
        timeLabel = formatTime(effectiveAt)
    )

    private class AlarmScheduleStore(context: Context) {
        private val preferences = context.getSharedPreferences(STORE_NAME, Context.MODE_PRIVATE)

        fun load(): List<AlarmRecord> = runCatching {
            JsonFiles.json.decodeFromString<List<AlarmRecord>>(preferences.getString(KEY_RECORDS, "[]").orEmpty())
        }.getOrDefault(emptyList())

        fun save(records: List<AlarmRecord>) {
            preferences.edit().putString(KEY_RECORDS, JsonFiles.json.encodeToString(records)).apply()
        }

        private companion object {
            const val STORE_NAME = "petwatch_alarm_schedule"
            const val KEY_RECORDS = "records"
        }
    }

    companion object {
        const val ACTION_FIRE = "com.example.petwatch.action.TASK_ALARM"
        const val ACTION_DONE = "com.example.petwatch.action.TASK_DONE"
        const val ACTION_POSTPONE = "com.example.petwatch.action.TASK_POSTPONE"
        const val ACTION_SKIP = "com.example.petwatch.action.TASK_SKIP"
        const val ACTION_SILENCE = "com.example.petwatch.action.TASK_SILENCE"
        const val EXTRA_TASK_ID = "extra_task_id"
        const val EXTRA_PET_NAME = "extra_pet_name"
        const val EXTRA_CARE_NAME = "extra_care_name"
        const val EXTRA_CARE_TYPE = "extra_care_type"
        const val EXTRA_TIME_LABEL = "extra_time_label"
        const val EXTRA_POSTPONE_MINUTES = "extra_postpone_minutes"
        private const val MAX_ALARMS = 100
        private const val TAG = "PetWatch"

        fun requestCode(taskId: String): Int = taskId.hashCode() and Int.MAX_VALUE
    }
}
