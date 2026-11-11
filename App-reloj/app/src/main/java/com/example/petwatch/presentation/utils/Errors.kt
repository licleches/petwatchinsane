package com.example.petwatch.presentation.utils

import com.example.petwatch.presentation.data.remote.BackendNotConfiguredException
import com.example.petwatch.presentation.data.remote.DeviceCredentialRejectedException
import com.example.petwatch.presentation.data.remote.EdgeFunctionException
import com.example.petwatch.presentation.data.remote.isNetworkError
import kotlinx.serialization.SerializationException

const val OFFLINE_MESSAGE = "Sin conexión. Revisa el Wi-Fi o el Bluetooth del teléfono."

/** Mensaje corto en español para mostrar en la pantalla del reloj. */
fun Throwable.userMessage(fallback: String = "Algo salió mal. Intenta de nuevo."): String = when {
    this is BackendNotConfiguredException -> "Falta configurar Supabase en local.properties."
    this is DeviceCredentialRejectedException -> "El reloj ya no está vinculado. Vincúlalo de nuevo."
    this is EdgeFunctionException -> when {
        statusCode == 429 -> "Demasiadas solicitudes. Espera un momento."
        statusCode >= 500 -> "El servidor no está disponible. Intenta más tarde."
        !errorDetail.isNullOrBlank() -> errorDetail
        else -> fallback
    }
    isNetworkError() -> OFFLINE_MESSAGE
    this is SerializationException -> "La respuesta del servidor no es válida."
    else -> fallback
}
