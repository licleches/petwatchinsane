package com.example.petwatch.presentation.ui.alarm

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.example.petwatch.presentation.data.alarm.TaskAlarmActionReceiver
import com.example.petwatch.presentation.data.alarm.TaskAlarmScheduler
import com.example.petwatch.presentation.data.model.CareType
import com.example.petwatch.presentation.ui.theme.PetWatchTheme

/** Alarma a pantalla completa (adaptado de MedicationAlarmActivity de MedTime). */
class TaskAlarmActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true)
        setTurnScreenOn(true)

        val taskId = intent.getStringExtra(TaskAlarmScheduler.EXTRA_TASK_ID)
        val petName = intent.getStringExtra(TaskAlarmScheduler.EXTRA_PET_NAME)
        if (taskId == null || petName == null) {
            finish()
            return
        }
        val careName = intent.getStringExtra(TaskAlarmScheduler.EXTRA_CARE_NAME).orEmpty()
        val careType = CareType.fromWire(intent.getStringExtra(TaskAlarmScheduler.EXTRA_CARE_TYPE))
        val timeLabel = intent.getStringExtra(TaskAlarmScheduler.EXTRA_TIME_LABEL).orEmpty()

        setContent {
            PetWatchTheme {
                TaskAlarmScreen(
                    petName = petName,
                    careName = careName,
                    careType = careType,
                    timeLabel = timeLabel,
                    onDone = { sendAction(TaskAlarmScheduler.ACTION_DONE, taskId) },
                    onPostpone = { minutes -> sendAction(TaskAlarmScheduler.ACTION_POSTPONE, taskId, minutes) },
                    onSkip = { sendAction(TaskAlarmScheduler.ACTION_SKIP, taskId) },
                    onSilence = { sendAction(TaskAlarmScheduler.ACTION_SILENCE, taskId) }
                )
            }
        }
    }

    private fun sendAction(action: String, taskId: String, minutes: Int? = null) {
        sendBroadcast(
            Intent(this, TaskAlarmActionReceiver::class.java).apply {
                this.action = action
                putExtra(TaskAlarmScheduler.EXTRA_TASK_ID, taskId)
                minutes?.let { putExtra(TaskAlarmScheduler.EXTRA_POSTPONE_MINUTES, it) }
            }
        )
        finish()
    }
}
