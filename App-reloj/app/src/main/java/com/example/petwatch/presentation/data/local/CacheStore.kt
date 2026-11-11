package com.example.petwatch.presentation.data.local

import android.content.Context
import com.example.petwatch.presentation.data.remote.PetsListResponse
import com.example.petwatch.presentation.data.remote.TaskDto
import com.example.petwatch.presentation.data.remote.TasksListResponse
import java.io.File
import java.time.Instant
import kotlinx.serialization.Serializable

@Serializable
data class CachedPets(val fetchedAtMillis: Long, val data: PetsListResponse)

@Serializable
data class CachedTasks(val fetchedAtMillis: Long, val data: TasksListResponse)

/** Última respuesta de mascotas y tareas, para mostrar algo sin conexión. */
class CacheStore(context: Context) {
    private val directory = File(context.applicationContext.filesDir, "cache")
    private val petsFile = File(directory, "mascotas.json")
    private val tasksFile = File(directory, "tareas.json")

    @Synchronized
    fun savePets(data: PetsListResponse, fetchedAt: Instant) {
        JsonFiles.write(petsFile, CachedPets(fetchedAt.toEpochMilli(), data))
    }

    @Synchronized
    fun loadPets(): CachedPets? = JsonFiles.read<CachedPets>(petsFile)

    @Synchronized
    fun saveTasks(data: TasksListResponse, fetchedAt: Instant) {
        JsonFiles.write(tasksFile, CachedTasks(fetchedAt.toEpochMilli(), data))
    }

    @Synchronized
    fun loadTasks(): CachedTasks? = JsonFiles.read<CachedTasks>(tasksFile)

    /** Reemplaza una tarea en la caché (después de cambiar su estado). */
    @Synchronized
    fun replaceTask(task: TaskDto) {
        val cached = loadTasks() ?: return
        val tasks = cached.data.tareas.map { if (it.id == task.id) task else it }
        JsonFiles.write(tasksFile, cached.copy(data = cached.data.copy(tareas = tasks)))
    }

    @Synchronized
    fun clear() {
        JsonFiles.delete(petsFile)
        JsonFiles.delete(tasksFile)
    }
}
