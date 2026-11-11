package com.example.petwatch.presentation.data.local

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString

@Serializable
data class PendingTaskAction(
    val taskId: String,
    val status: String,
    val postponeMinutes: Int? = null,
    val createdAtMillis: Long
)

/**
 * Acciones de tarea hechas sin conexión (o desde la alarma). Las envía
 * TaskActionWorker con WorkManager; mientras tanto se muestran en Inicio.
 */
class PendingTaskActionStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE
    )

    @Synchronized
    fun all(): Map<String, PendingTaskAction> = load().associateBy { it.taskId }

    @Synchronized
    fun get(taskId: String): PendingTaskAction? = load().firstOrNull { it.taskId == taskId }

    @Synchronized
    fun put(action: PendingTaskAction) {
        save(load().filterNot { it.taskId == action.taskId } + action)
    }

    @Synchronized
    fun remove(taskId: String) {
        save(load().filterNot { it.taskId == taskId })
    }

    @Synchronized
    fun clear() {
        preferences.edit().clear().apply()
    }

    private fun load(): List<PendingTaskAction> = runCatching {
        JsonFiles.json.decodeFromString<List<PendingTaskAction>>(
            preferences.getString(KEY_ACTIONS, "[]").orEmpty()
        )
    }.getOrDefault(emptyList())

    private fun save(actions: List<PendingTaskAction>) {
        preferences.edit()
            .putString(KEY_ACTIONS, JsonFiles.json.encodeToString(actions))
            .apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "petwatch_pending_task_actions"
        const val KEY_ACTIONS = "actions"
    }
}
