package com.example.petwatch.presentation.utils

import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/** ISO-8601 con `Z` u offset (`+00:00`). */
fun parseInstant(value: String?): Instant? {
    if (value.isNullOrBlank()) return null
    return runCatching { OffsetDateTime.parse(value).toInstant() }.getOrNull()
        ?: runCatching { Instant.parse(value) }.getOrNull()
}

/** ISO-8601 en UTC con milisegundos, el formato que acepta el backend. */
fun Instant.toIsoMillis(): String = truncatedTo(ChronoUnit.MILLIS).toString()

fun formatTime(value: Instant, zone: ZoneId = ZoneId.systemDefault()): String =
    timeFormatter.withZone(zone).format(value)

/** "En 15 min", "En 2 h 5 min", "Hace 20 min". */
fun formatRelative(value: Instant, now: Instant = Instant.now()): String {
    val minutes = Duration.between(now, value).toMinutes()
    return when {
        minutes in 0..0 -> "Ahora"
        minutes > 0 && minutes < 60 -> "En $minutes min"
        minutes >= 60 -> "En ${minutes / 60} h ${minutes % 60} min"
        minutes > -60 -> "Hace ${-minutes} min"
        else -> "Hace ${-minutes / 60} h"
    }
}

/** 1:05:09 o 05:09. */
fun formatDuration(totalSeconds: Long): String {
    val seconds = totalSeconds.coerceAtLeast(0)
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    val secs = seconds % 60
    return if (hours > 0) {
        String.format(Locale.US, "%d:%02d:%02d", hours, minutes, secs)
    } else {
        String.format(Locale.US, "%02d:%02d", minutes, secs)
    }
}

/** "2.35 km" o "850 m". */
fun formatDistance(meters: Double?): String {
    if (meters == null) return "—"
    return if (meters >= 1000) {
        String.format(Locale.US, "%.2f km", meters / 1000.0)
    } else {
        String.format(Locale.US, "%d m", meters.toLong())
    }
}

fun formatKilometers(meters: Double?): String =
    if (meters == null) "—" else String.format(Locale.US, "%.2f", meters / 1000.0)
