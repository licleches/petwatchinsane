package com.example.petwatch.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.petwatch.presentation.data.model.Pet
import com.example.petwatch.presentation.data.model.PetsData
import com.example.petwatch.presentation.data.model.WalkSession
import com.example.petwatch.presentation.data.model.WalkSummary
import com.example.petwatch.presentation.data.remote.DeviceCredentialRejectedException
import com.example.petwatch.presentation.data.remote.isNetworkError
import com.example.petwatch.presentation.data.repository.GpsStatus
import com.example.petwatch.presentation.data.repository.PetRepository
import com.example.petwatch.presentation.data.repository.WalkRepository
import com.example.petwatch.presentation.utils.formatTime
import com.example.petwatch.presentation.utils.userMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface PetsUiState {
    data object Loading : PetsUiState
    data class Ready(val data: PetsData, val offlineMessage: String?) : PetsUiState
    data class Error(val message: String) : PetsUiState
    data object CredentialInvalid : PetsUiState
}

/** Lista de mascotas (paseo e incidente) y control del paseo en curso. */
class WalkViewModel(
    private val walkRepository: WalkRepository,
    private val petRepository: PetRepository
) : ViewModel() {
    val session: StateFlow<WalkSession?> = walkRepository.session
    val lastSummary: StateFlow<WalkSummary?> = walkRepository.lastSummary
    val gpsStatus: StateFlow<GpsStatus> = walkRepository.gpsStatus

    private val _pets = MutableStateFlow<PetsUiState>(PetsUiState.Loading)
    val pets: StateFlow<PetsUiState> = _pets.asStateFlow()

    private val _selection = MutableStateFlow<Set<String>>(emptySet())
    val selection: StateFlow<Set<String>> = _selection.asStateFlow()

    /** Muestra la lista guardada al instante y la actualiza del servidor. */
    fun loadPets() {
        viewModelScope.launch {
            val cached = petRepository.cached()
            _pets.value = if (cached != null) PetsUiState.Ready(cached, null) else PetsUiState.Loading
            cached?.let(::cleanSelection)
            try {
                val fresh = petRepository.refresh()
                _pets.value = PetsUiState.Ready(fresh, null)
                cleanSelection(fresh)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (rejected: DeviceCredentialRejectedException) {
                _pets.value = PetsUiState.CredentialInvalid
            } catch (error: Exception) {
                _pets.value = if (cached != null) {
                    PetsUiState.Ready(
                        cached,
                        if (error.isNetworkError()) "Sin conexión · lista de las ${formatTime(cached.fetchedAt)}" else error.userMessage()
                    )
                } else {
                    PetsUiState.Error(error.userMessage("No se pudieron cargar las mascotas."))
                }
            }
        }
    }

    /** Un paseo es de un solo hogar: elegir una mascota de otro hogar reemplaza la selección. */
    fun toggle(pet: Pet) {
        val current = _selection.value
        val pets = (_pets.value as? PetsUiState.Ready)?.data?.pets.orEmpty()
        val selectedHousehold = pets.firstOrNull { it.id in current }?.householdId
        _selection.value = when {
            pet.id in current -> current - pet.id
            selectedHousehold != null && selectedHousehold != pet.householdId -> setOf(pet.id)
            else -> current + pet.id
        }
    }

    fun start(): Boolean {
        val data = (_pets.value as? PetsUiState.Ready)?.data ?: return false
        val chosen = data.pets.filter { it.id in _selection.value }
        if (chosen.isEmpty()) return false
        walkRepository.start(chosen)
        _selection.value = emptySet()
        return true
    }

    fun pause() = walkRepository.pause()

    fun resume() = walkRepository.resume()

    fun finish() = walkRepository.finish()

    private fun cleanSelection(data: PetsData) {
        val ids = data.pets.map { it.id }.toSet()
        val kept = _selection.value.filter { it in ids }.toSet()
        _selection.value = if (kept.isEmpty() && data.pets.size == 1) setOf(data.pets.first().id) else kept
    }

    class Factory(
        private val walkRepository: WalkRepository,
        private val petRepository: PetRepository
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(WalkViewModel::class.java))
            return WalkViewModel(walkRepository, petRepository) as T
        }
    }
}
