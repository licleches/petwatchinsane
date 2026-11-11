package com.example.petwatch.presentation.data.repository

import com.example.petwatch.presentation.data.local.CacheStore
import com.example.petwatch.presentation.data.local.DeviceCredentialStore
import com.example.petwatch.presentation.data.model.Household
import com.example.petwatch.presentation.data.model.Pet
import com.example.petwatch.presentation.data.model.PetsData
import com.example.petwatch.presentation.data.remote.DeviceCredentialRejectedException
import com.example.petwatch.presentation.data.remote.EdgeFunctionsClient
import com.example.petwatch.presentation.data.remote.PetsListResponse
import java.time.Instant

/** Hogares y mascotas activas del usuario del reloj (watch-pets-list), con caché. */
class PetRepository(
    private val client: EdgeFunctionsClient,
    private val credentialStore: DeviceCredentialStore,
    private val cacheStore: CacheStore
) {
    suspend fun refresh(): PetsData {
        val credential = credentialStore.load() ?: throw DeviceCredentialRejectedException()
        val response = client.listPets(credential)
        val now = Instant.now()
        cacheStore.savePets(response, now)
        return response.toPetsData(now, fromCache = false)
    }

    fun cached(): PetsData? = cacheStore.loadPets()?.let {
        it.data.toPetsData(Instant.ofEpochMilli(it.fetchedAtMillis), fromCache = true)
    }

    private fun PetsListResponse.toPetsData(fetchedAt: Instant, fromCache: Boolean) = PetsData(
        households = hogares.map { Household(it.id, it.nombre) },
        pets = mascotas.map { Pet(it.id, it.hogarId, it.nombre, it.especie) },
        fetchedAt = fetchedAt,
        fromCache = fromCache
    )
}
