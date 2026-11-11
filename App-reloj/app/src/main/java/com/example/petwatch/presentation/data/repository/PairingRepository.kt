package com.example.petwatch.presentation.data.repository

import com.example.petwatch.presentation.data.local.DeviceCredential
import com.example.petwatch.presentation.data.local.DeviceCredentialStore
import com.example.petwatch.presentation.data.local.PendingPairing
import com.example.petwatch.presentation.data.remote.EdgeFunctionsClient
import com.example.petwatch.presentation.data.remote.PairingStartResponse
import com.example.petwatch.presentation.data.remote.PairingStatusResponse
import java.time.Instant

/** Vinculación por código de 6 dígitos (copiado de MedTime Watch). */
class PairingRepository(
    private val client: EdgeFunctionsClient,
    private val credentialStore: DeviceCredentialStore,
    private val onPaired: () -> Unit = {},
    private val onCredentialCleared: () -> Unit = {}
) {
    fun hasValidCredential(): Boolean = credentialStore.load() != null

    suspend fun startPairing(): PairingStartResponse = client.startPairing()

    fun loadPendingPairing(): PendingPairing? = credentialStore.loadPendingPairing()

    fun savePendingPairing(response: PairingStartResponse, expiresAt: Instant): PendingPairing =
        PendingPairing(
            requestId = response.requestId,
            pairingCode = response.pairingCode,
            challengeSecret = response.challengeSecret,
            expiresAt = expiresAt
        ).also(credentialStore::savePendingPairing)

    suspend fun getPairingStatus(
        requestId: String,
        challengeSecret: String
    ): PairingStatusResponse = client.getPairingStatus(requestId, challengeSecret)

    fun hasCompleteCredential(response: PairingStatusResponse): Boolean =
        runCatching { buildCredential(response) }.isSuccess

    fun saveApprovedCredential(response: PairingStatusResponse): DeviceCredential {
        return buildCredential(response).also {
            credentialStore.save(it)
            onPaired()
        }
    }

    private fun buildCredential(response: PairingStatusResponse): DeviceCredential {
        val deviceId = response.deviceId?.takeIf(String::isNotBlank)
            ?: throw PairingProtocolException("La respuesta no contiene device_id")
        val deviceToken = response.deviceToken?.takeIf(String::isNotBlank)
            ?: throw PairingProtocolException("La respuesta no contiene device_token")
        val expiresAt = response.credentialExpiresAt()
            ?.let { value -> runCatching { Instant.parse(value) }.getOrNull() }
            ?.takeIf { it.isAfter(Instant.now()) }
            ?: throw PairingProtocolException("La respuesta no contiene una expiración válida")

        return DeviceCredential(deviceId, deviceToken, expiresAt)
    }

    /** La credencial fue rechazada o revocada: se borra y se limpian los datos locales. */
    fun clearCredential() {
        credentialStore.clear()
        onCredentialCleared()
    }

    fun clearPendingPairing() {
        credentialStore.clearPendingPairing()
    }

    companion object {
        const val STATUS_PENDING = "pending"
        const val STATUS_APPROVED = "approved"
        const val STATUS_LINKED = "linked"
        const val STATUS_EXPIRED = "expired"
        const val STATUS_CLAIMED = "claimed"
    }
}

class PairingProtocolException(message: String) : IllegalStateException(message)
