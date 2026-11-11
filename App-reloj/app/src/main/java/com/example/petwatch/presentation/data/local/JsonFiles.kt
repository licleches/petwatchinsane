package com.example.petwatch.presentation.data.local

import android.util.AtomicFile
import java.io.File
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** Lectura y escritura atómica de JSON en archivos privados de la app. */
object JsonFiles {
    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    inline fun <reified T> read(file: File): T? {
        if (!file.exists()) return null
        return runCatching {
            json.decodeFromString<T>(AtomicFile(file).readFully().toString(Charsets.UTF_8))
        }.getOrNull()
    }

    inline fun <reified T> write(file: File, value: T) {
        file.parentFile?.mkdirs()
        val atomicFile = AtomicFile(file)
        val output = atomicFile.startWrite()
        try {
            output.write(json.encodeToString(value).toByteArray(Charsets.UTF_8))
            atomicFile.finishWrite(output)
        } catch (error: Exception) {
            atomicFile.failWrite(output)
            throw error
        }
    }

    fun delete(file: File) {
        AtomicFile(file).delete()
    }
}
