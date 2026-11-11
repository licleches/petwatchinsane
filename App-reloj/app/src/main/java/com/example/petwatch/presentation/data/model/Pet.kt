package com.example.petwatch.presentation.data.model

import java.time.Instant

data class Household(
    val id: String,
    val name: String
)

data class Pet(
    val id: String,
    val householdId: String,
    val name: String,
    val species: String
) {
    val emoji: String
        get() = when (species) {
            "perro" -> "🐶"
            "gato" -> "🐱"
            "ave" -> "🐦"
            "conejo" -> "🐰"
            "roedor" -> "🐹"
            "reptil" -> "🦎"
            "pez" -> "🐟"
            else -> "🐾"
        }
}

data class PetsData(
    val households: List<Household>,
    val pets: List<Pet>,
    val fetchedAt: Instant,
    val fromCache: Boolean
) {
    fun householdName(id: String): String =
        households.firstOrNull { it.id == id }?.name ?: "Hogar"
}
