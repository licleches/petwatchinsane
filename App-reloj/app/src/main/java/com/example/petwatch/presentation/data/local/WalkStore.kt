package com.example.petwatch.presentation.data.local

import android.content.Context
import android.util.Log
import com.example.petwatch.presentation.data.model.RoutePoint
import com.example.petwatch.presentation.data.model.WalkSession
import com.example.petwatch.presentation.data.model.WalkSummary
import java.io.File
import java.io.FileOutputStream
import java.util.Locale

/**
 * Paseo en curso guardado en el reloj: el estado en JSON (escritura atómica) y
 * la ruta en un archivo de solo-agregar "lat,lng,t" (barato aunque llegue 1 punto/s).
 */
class WalkStore(context: Context) {
    private val directory = File(context.applicationContext.filesDir, "paseo")
    private val sessionFile = File(directory, "en_curso.json")
    private val routeFile = File(directory, "ruta.csv")
    private val summaryFile = File(directory, "ultimo_resumen.json")

    @Synchronized
    fun load(): WalkSession? = JsonFiles.read<WalkSession>(sessionFile)

    @Synchronized
    fun save(session: WalkSession) {
        JsonFiles.write(sessionFile, session)
    }

    @Synchronized
    fun appendRoute(points: List<RoutePoint>) {
        if (points.isEmpty()) return
        directory.mkdirs()
        runCatching {
            FileOutputStream(routeFile, true).bufferedWriter().use { writer ->
                points.forEach { point ->
                    writer.append(String.format(Locale.US, "%.7f,%.7f,%d\n", point.lat, point.lng, point.t))
                }
            }
        }.onFailure { Log.w(TAG, "route append failed type=${it::class.java.simpleName}") }
    }

    @Synchronized
    fun readRoute(): List<RoutePoint> {
        if (!routeFile.exists()) return emptyList()
        return runCatching {
            routeFile.useLines { lines ->
                lines.mapNotNull { line ->
                    val parts = line.split(',')
                    if (parts.size != 3) return@mapNotNull null
                    val lat = parts[0].toDoubleOrNull() ?: return@mapNotNull null
                    val lng = parts[1].toDoubleOrNull() ?: return@mapNotNull null
                    val time = parts[2].trim().toLongOrNull() ?: return@mapNotNull null
                    RoutePoint(lat, lng, time)
                }.toList()
            }
        }.getOrDefault(emptyList())
    }

    @Synchronized
    fun clearSession() {
        JsonFiles.delete(sessionFile)
        routeFile.delete()
    }

    @Synchronized
    fun saveSummary(summary: WalkSummary) {
        JsonFiles.write(summaryFile, summary)
    }

    @Synchronized
    fun loadSummary(): WalkSummary? = JsonFiles.read<WalkSummary>(summaryFile)

    private companion object {
        const val TAG = "PetWatch"
    }
}
