package com.example.petwatch.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.petwatch.presentation.data.model.PetTask
import com.example.petwatch.presentation.data.model.TaskAction
import com.example.petwatch.presentation.data.model.TasksData
import com.example.petwatch.presentation.data.remote.DeviceCredentialRejectedException
import com.example.petwatch.presentation.data.remote.isNetworkError
import com.example.petwatch.presentation.data.repository.ActionOutcome
import com.example.petwatch.presentation.data.repository.PetRepository
import com.example.petwatch.presentation.data.repository.TaskRepository
import com.example.petwatch.presentation.utils.formatTime
import com.example.petwatch.presentation.utils.userMessage
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface HomeUiState {
    data object Loading : HomeUiState
    data class Ready(
        val openTasks: List<PetTask>,
        val doneTasks: List<PetTask>,
        val fetchedAt: Instant,
        /** No es null cuando se muestran datos guardados porque falló la conexión. */
        val offlineMessage: String?
    ) : HomeUiState
    data class Error(val message: String, val offline: Boolean) : HomeUiState
    data object CredentialInvalid : HomeUiState
}

class HomeViewModel(
    private val taskRepository: TaskRepository,
    private val petRepository: PetRepository,
    private val onTasksLoaded: (List<PetTask>) -> Unit
) : ViewModel() {
    private val _state = MutableStateFlow<HomeUiState>(HomeUiState.Loading)
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    private val _actionInProgress = MutableStateFlow<String?>(null)
    val actionInProgress: StateFlow<String?> = _actionInProgress.asStateFlow()

    /** Mensaje breve para mostrar arriba en Inicio (se oculta solo). */
    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice.asStateFlow()

    private var allTasks: List<PetTask> = emptyList()
    private var refreshJob: Job? = null

    fun task(id: String): PetTask? = allTasks.firstOrNull { it.id == id }

    fun refresh() {
        if (refreshJob?.isActive == true) return
        refreshJob = viewModelScope.launch {
            if (_state.value !is HomeUiState.Ready) {
                val cached = taskRepository.cached()
                if (cached != null) publish(cached, offlineMessage = null) else _state.value = HomeUiState.Loading
            }
            try {
                val data = taskRepository.refresh()
                publish(data, offlineMessage = null)
                onTasksLoaded(data.tasks)
                launch { runCatching { petRepository.refresh() } }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (rejected: DeviceCredentialRejectedException) {
                _state.value = HomeUiState.CredentialInvalid
            } catch (error: Exception) {
                val cached = taskRepository.cached()
                if (cached != null) {
                    val message = if (error.isNetworkError()) {
                        "Sin conexión · datos de las ${formatTime(cached.fetchedAt)}"
                    } else {
                        error.userMessage("No se pudo actualizar.")
                    }
                    publish(cached, offlineMessage = message)
                    onTasksLoaded(cached.tasks)
                } else {
                    _state.value = HomeUiState.Error(
                        message = error.userMessage("No se pudieron cargar las tareas."),
                        offline = error.isNetworkError()
                    )
                }
            }
        }
    }

    /** Hecha / posponer / omitir. [onFinished] recibe true si se guardó (o quedó en cola). */
    fun applyAction(
        taskId: String,
        action: TaskAction,
        postponeMinutes: Int?,
        onFinished: (success: Boolean, message: String?) -> Unit
    ) {
        if (_actionInProgress.value != null) return
        viewModelScope.launch {
            _actionInProgress.value = taskId
            try {
                val outcome = taskRepository.apply(taskId, action, postponeMinutes)
                val message = when {
                    outcome == ActionOutcome.QUEUED -> "Sin conexión: se enviará después"
                    action == TaskAction.DONE -> "Tarea hecha"
                    action == TaskAction.POSTPONE -> "Pospuesta $postponeMinutes min"
                    else -> "Tarea omitida"
                }
                _notice.value = message
                taskRepository.cached()?.let { cached ->
                    val offline = (_state.value as? HomeUiState.Ready)?.offlineMessage
                    publish(cached.copy(fetchedAt = cached.fetchedAt), offline)
                    onTasksLoaded(cached.tasks)
                }
                onFinished(true, message)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (rejected: DeviceCredentialRejectedException) {
                _state.value = HomeUiState.CredentialInvalid
                onFinished(false, rejected.userMessage())
            } catch (error: Exception) {
                // 404 / 409: otra persona ya la resolvió; se recarga la lista.
                onFinished(false, error.userMessage("No se pudo actualizar la tarea."))
                refreshJob?.cancel()
                refresh()
            } finally {
                _actionInProgress.value = null
            }
        }
    }

    fun clearNotice() {
        _notice.value = null
    }

    private fun publish(data: TasksData, offlineMessage: String?) {
        allTasks = data.tasks
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val now = Instant.now()
        val todays = data.tasks.filter { task ->
            task.effectiveAt.atZone(zone).toLocalDate() == today ||
                (task.isOpen && task.effectiveAt.isBefore(now))
        }
        _state.value = HomeUiState.Ready(
            openTasks = todays.filter { it.isOpen }.sortedBy { it.effectiveAt },
            doneTasks = todays.filterNot { it.isOpen }.sortedByDescending { it.doneAt ?: it.scheduledFor },
            fetchedAt = data.fetchedAt,
            offlineMessage = offlineMessage
        )
    }

    class Factory(
        private val taskRepository: TaskRepository,
        private val petRepository: PetRepository,
        private val onTasksLoaded: (List<PetTask>) -> Unit
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(HomeViewModel::class.java))
            return HomeViewModel(taskRepository, petRepository, onTasksLoaded) as T
        }
    }
}
