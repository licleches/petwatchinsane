package com.example.petwatch.presentation.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.petwatch.presentation.data.local.PendingPairing
import com.example.petwatch.presentation.data.remote.EdgeFunctionException
import com.example.petwatch.presentation.data.repository.PairingRepository
import com.example.petwatch.presentation.data.repository.PairingRepository.Companion.STATUS_APPROVED
import com.example.petwatch.presentation.data.repository.PairingRepository.Companion.STATUS_CLAIMED
import com.example.petwatch.presentation.data.repository.PairingRepository.Companion.STATUS_EXPIRED
import com.example.petwatch.presentation.data.repository.PairingRepository.Companion.STATUS_LINKED
import com.example.petwatch.presentation.data.repository.PairingRepository.Companion.STATUS_PENDING
import com.example.petwatch.presentation.utils.userMessage
import java.time.Instant
import kotlin.math.max
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

sealed interface PairingUiState {
    data object Starting : PairingUiState
    data class Pending(
        val pairingCode: String,
        val remainingSeconds: Long,
        val errorMessage: String? = null
    ) : PairingUiState
    data object Expired : PairingUiState
    data class Error(val message: String) : PairingUiState
    data object Ready : PairingUiState
}

/** Vinculación con polling y backoff (copiado de MedTime Watch). */
class PairingViewModel(
    private val repository: PairingRepository
) : ViewModel() {
    private val _state = MutableStateFlow<PairingUiState>(PairingUiState.Starting)
    val state: StateFlow<PairingUiState> = _state.asStateFlow()

    private var pairingJob: Job? = null

    init {
        restoreOrStart()
    }

    fun startPairing() {
        pairingJob?.cancel()
        repository.clearPendingPairing()
        launchNewPairing()
    }

    /** La credencial fue rechazada (revocada o expirada): volver a vincular. */
    fun clearAndStartPairing() {
        if (_state.value != PairingUiState.Ready && pairingJob?.isActive == true) return
        repository.clearCredential()
        repository.clearPendingPairing()
        launchNewPairing()
    }

    private fun launchNewPairing() {
        pairingJob?.cancel()
        pairingJob = viewModelScope.launch {
            _state.value = PairingUiState.Starting
            try {
                val response = repository.startPairing()
                val expiresAt = runCatching { Instant.parse(response.expiresAt) }.getOrNull()
                    ?: throw IllegalStateException("El servidor devolvió una expiración inválida")
                require(response.requestId.isNotBlank())
                require(response.challengeSecret.isNotBlank())
                require(response.pairingCode.matches(Regex("\\d{6}")))

                if (!expiresAt.isAfter(Instant.now())) {
                    _state.value = PairingUiState.Expired
                    return@launch
                }

                val pendingPairing = repository.savePendingPairing(response, expiresAt)
                runPolling(pendingPairing)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                Log.w(TAG, "startPairing failed type=${error::class.java.simpleName}")
                _state.value = PairingUiState.Error(startErrorMessage(error))
            }
        }
    }

    private fun restoreOrStart() {
        if (repository.hasValidCredential()) {
            _state.value = PairingUiState.Ready
            return
        }
        val pendingPairing = repository.loadPendingPairing()
        if (pendingPairing != null) {
            pairingJob?.cancel()
            pairingJob = viewModelScope.launch { runPolling(pendingPairing) }
        } else {
            launchNewPairing()
        }
    }

    private suspend fun runPolling(pendingPairing: PendingPairing) {
        val expiresAt = pendingPairing.expiresAt
        var nextPollAt = System.currentTimeMillis() + INITIAL_POLL_DELAY_MILLIS
        var backoffMillis = INITIAL_POLL_DELAY_MILLIS
        var lastError: String? = null

        while (currentCoroutineContext().isActive) {
            val remainingSeconds = max(0, expiresAt.epochSecond - Instant.now().epochSecond)
            if (remainingSeconds <= 0) {
                repository.clearPendingPairing()
                _state.value = PairingUiState.Expired
                return
            }

            _state.value = PairingUiState.Pending(pendingPairing.pairingCode, remainingSeconds, lastError)
            delay(SECOND_MILLIS)
            if (System.currentTimeMillis() < nextPollAt) continue

            try {
                val response = repository.getPairingStatus(
                    pendingPairing.requestId,
                    pendingPairing.challengeSecret
                )
                lastError = null
                when (response.status.trim().lowercase()) {
                    STATUS_PENDING -> {
                        backoffMillis = INITIAL_POLL_DELAY_MILLIS
                        nextPollAt = System.currentTimeMillis() + backoffMillis
                    }
                    STATUS_EXPIRED -> {
                        repository.clearPendingPairing()
                        _state.value = PairingUiState.Expired
                        return
                    }
                    STATUS_APPROVED, STATUS_LINKED, STATUS_CLAIMED -> {
                        if (repository.hasCompleteCredential(response)) {
                            repository.saveApprovedCredential(response)
                            Log.i(TAG, "pairing completed; credential stored")
                            _state.value = PairingUiState.Ready
                            return
                        }
                        // Ya se entregó el token antes (respuesta perdida): hay que vincular de nuevo.
                        repository.clearPendingPairing()
                        _state.value = PairingUiState.Error(
                            "Este código ya fue utilizado. Genera uno nuevo y desvincula el reloj anterior en la app."
                        )
                        return
                    }
                    else -> {
                        _state.value = PairingUiState.Error(
                            "El servidor devolvió un estado de vinculación no reconocido."
                        )
                        return
                    }
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error is EdgeFunctionException && error.errorCode in TERMINAL_ERROR_CODES) {
                    repository.clearPendingPairing()
                    _state.value = if (error.errorCode == "PAIRING_EXPIRED") {
                        PairingUiState.Expired
                    } else {
                        PairingUiState.Error(error.errorDetail ?: "La vinculación ya no está disponible. Genera un código nuevo.")
                    }
                    return
                }
                lastError = if (error is EdgeFunctionException) {
                    "No se pudo comprobar la autorización. Reintentando..."
                } else {
                    "Sin conexión. Reintentando..."
                }
                nextPollAt = System.currentTimeMillis() + backoffMillis
                backoffMillis = (backoffMillis * 2).coerceAtMost(MAX_BACKOFF_MILLIS)
            }
        }
    }

    private fun startErrorMessage(error: Exception): String = when {
        error is EdgeFunctionException && error.errorCode == "ACTIVE_REQUEST" ->
            "Este reloj ya tiene un código activo. Espera 5 minutos o apruébalo en la app."
        error is EdgeFunctionException && error.statusCode == 429 ->
            "Demasiados intentos. Espera un momento."
        else -> error.userMessage("No se pudo solicitar un código.")
    }

    class Factory(
        private val repository: PairingRepository
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(PairingViewModel::class.java))
            return PairingViewModel(repository) as T
        }
    }

    private companion object {
        const val TAG = "PetWatch"
        const val INITIAL_POLL_DELAY_MILLIS = 3_000L
        const val MAX_BACKOFF_MILLIS = 30_000L
        const val SECOND_MILLIS = 1_000L
        val TERMINAL_ERROR_CODES = setOf(
            "PAIRING_EXPIRED",
            "PAIRING_REVOKED",
            "PAIRING_LOCKED",
            "PAIRING_NOT_FOUND",
            "DEVICE_REVOKED",
            "INVALID_CHALLENGE"
        )
    }
}
