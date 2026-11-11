package com.example.petwatch.presentation.data.local

import java.time.Instant

data class DeviceCredential(
    val deviceId: String,
    val deviceToken: String,
    val tokenExpiresAt: Instant
) {
    fun isExpired(now: Instant = Instant.now()): Boolean =
        !tokenExpiresAt.isAfter(now)
}

data class PendingPairing(
    val requestId: String,
    val pairingCode: String,
    val challengeSecret: String,
    val expiresAt: Instant
) {
    fun isExpired(now: Instant = Instant.now()): Boolean =
        !expiresAt.isAfter(now)
}
