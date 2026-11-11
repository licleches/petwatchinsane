package com.example.petwatch.presentation.data.walk

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.health.services.client.ExerciseClient
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.clearUpdateCallback
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseTrackedStatus
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import androidx.health.services.client.data.LocationAvailability
import androidx.health.services.client.endExercise
import androidx.health.services.client.getCapabilities
import androidx.health.services.client.getCurrentExerciseInfo
import androidx.health.services.client.pauseExercise
import androidx.health.services.client.resumeExercise
import androidx.health.services.client.startExercise
import com.example.petwatch.R
import com.example.petwatch.presentation.MainActivity
import com.example.petwatch.presentation.appContainer
import com.example.petwatch.presentation.data.alarm.NotificationChannels
import com.example.petwatch.presentation.data.model.RoutePoint
import com.example.petwatch.presentation.data.model.WalkSession
import com.example.petwatch.presentation.data.repository.GpsStatus
import com.example.petwatch.presentation.data.repository.WalkRepository
import com.example.petwatch.presentation.utils.Permissions
import com.example.petwatch.presentation.utils.formatDistance
import com.example.petwatch.presentation.utils.formatDuration
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Registra el paseo con Health Services (ExerciseType.WALKING): tiempo activo,
 * distancia, pasos y ubicación. Corre en primer plano (tipos health y location)
 * para seguir aunque se cierre la app; el estado vive en WalkRepository/WalkStore.
 */
class WalkService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val commands = Mutex()
    private val finishing = AtomicBoolean(false)
    private var exerciseEnded: CompletableDeferred<Unit>? = null
    private var tickerJob: Job? = null
    private var callbackRegistered = false

    private val repository: WalkRepository by lazy { appContainer.walkRepository }
    private val exerciseClient: ExerciseClient by lazy { HealthServices.getClient(this).exerciseClient }

    private val callback = object : ExerciseUpdateCallback {
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            scope.launch { handleUpdate(update) }
        }

        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) = Unit

        override fun onRegistered() = Unit

        override fun onRegistrationFailed(throwable: Throwable) {
            Log.w(TAG, "exercise callback registration failed type=${throwable::class.java.simpleName}")
        }

        override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {
            if (availability !is LocationAvailability) return
            repository.setGpsStatus(
                when (availability) {
                    LocationAvailability.ACQUIRED_TETHERED, LocationAvailability.ACQUIRED_UNTETHERED -> GpsStatus.READY
                    LocationAvailability.ACQUIRING -> GpsStatus.SEARCHING
                    else -> GpsStatus.UNAVAILABLE
                }
            )
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val session = repository.current()
        // startForegroundService exige startForeground aunque el servicio se detenga enseguida.
        val inForeground = startInForeground(session)
        if (session == null) {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        if (!inForeground) {
            // No se pudo entrar en primer plano (permiso o reinicio en segundo plano):
            // el paseo se cierra con lo que ya se guardó, para no perderlo.
            scope.launch { finishWalk(endExercise = true) }
            return START_NOT_STICKY
        }
        val action = intent?.action ?: ACTION_RESTORE
        scope.launch {
            commands.withLock {
                when (action) {
                    ACTION_START -> beginTracking(session)
                    ACTION_RESTORE -> reattach(session)
                    ACTION_PAUSE -> pause()
                    ACTION_RESUME -> resume()
                    ACTION_FINISH -> finishWalk(endExercise = true)
                }
            }
        }
        startTicker()
        return START_STICKY
    }

    override fun onDestroy() {
        tickerJob?.cancel()
        scope.cancel()
        super.onDestroy()
    }

    private suspend fun beginTracking(session: WalkSession) {
        val started = runCatching { startExercise() }.getOrElse {
            Log.w(TAG, "health services unavailable type=${it::class.java.simpleName}")
            null
        }
        if (started == null) {
            // Sin Health Services (o sin el tipo WALKING): se mide solo el tiempo.
            repository.mutate { it.copy(usesHealthServices = false, gpsEnabled = false) }
            repository.setGpsStatus(GpsStatus.OFF)
        } else {
            repository.mutate { it.copy(usesHealthServices = true, gpsEnabled = started) }
            repository.setGpsStatus(if (started) GpsStatus.SEARCHING else GpsStatus.OFF)
        }
        updateNotification()
        Log.i(TAG, "walk started healthServices=${started != null} gps=${started == true} pets=${session.petIds.size}")
    }

    /** @return true si se activó el GPS; null si Health Services no puede registrar caminatas. */
    private suspend fun startExercise(): Boolean? {
        val capabilities = exerciseClient.getCapabilities()
        if (ExerciseType.WALKING !in capabilities.supportedExerciseTypes) return null
        val supported = capabilities.getExerciseTypeCapabilities(ExerciseType.WALKING).supportedDataTypes
        val gps = Permissions.hasLocation(this) && DataType.LOCATION in supported
        val dataTypes = buildSet<DataType<*, *>> {
            if (DataType.STEPS_TOTAL in supported) add(DataType.STEPS_TOTAL)
            if (DataType.DISTANCE_TOTAL in supported) add(DataType.DISTANCE_TOTAL)
            if (gps) add(DataType.LOCATION)
        }
        val info = exerciseClient.getCurrentExerciseInfo()
        if (info.exerciseTrackedStatus == ExerciseTrackedStatus.OTHER_APP_IN_PROGRESS) {
            Log.w(TAG, "another app is tracking an exercise; PetWatch takes over")
        }
        registerCallback()
        exerciseClient.startExercise(
            ExerciseConfig.builder(ExerciseType.WALKING)
                .setDataTypes(dataTypes)
                .setIsAutoPauseAndResumeEnabled(false)
                .setIsGpsEnabled(gps)
                .build()
        )
        return gps
    }

    /** La app o el servicio se reiniciaron: vuelve a escuchar el ejercicio en curso. */
    private suspend fun reattach(session: WalkSession) {
        if (!session.usesHealthServices) {
            updateNotification()
            return
        }
        val status = runCatching { exerciseClient.getCurrentExerciseInfo().exerciseTrackedStatus }
            .getOrDefault(ExerciseTrackedStatus.UNKNOWN)
        if (status == ExerciseTrackedStatus.OWNED_EXERCISE_IN_PROGRESS) {
            registerCallback()
            updateNotification()
        } else {
            // El ejercicio terminó mientras la app no corría: se guarda lo registrado.
            Log.w(TAG, "exercise no longer in progress status=$status; finishing walk")
            finishWalk(endExercise = false)
        }
    }

    private suspend fun pause() {
        val session = repository.current() ?: return
        if (session.paused) return
        if (session.usesHealthServices) {
            runCatching { exerciseClient.pauseExercise() }
                .onFailure { Log.w(TAG, "pause failed type=${it::class.java.simpleName}") }
        }
        val now = System.currentTimeMillis()
        // Respaldo local inmediato; la siguiente actualización de Health Services lo corrige.
        repository.mutate { it.copy(paused = true, activeDurationMillis = it.activeDurationAt(now), checkpointAtMillis = now) }
        updateNotification()
    }

    private suspend fun resume() {
        val session = repository.current() ?: return
        if (!session.paused) return
        if (session.usesHealthServices) {
            runCatching { exerciseClient.resumeExercise() }
                .onFailure { Log.w(TAG, "resume failed type=${it::class.java.simpleName}") }
        }
        val now = System.currentTimeMillis()
        repository.mutate { it.copy(paused = false, checkpointAtMillis = now) }
        updateNotification()
    }

    private suspend fun finishWalk(endExercise: Boolean) {
        if (!finishing.compareAndSet(false, true)) return
        val session = repository.current()
        if (session != null && session.usesHealthServices && endExercise) {
            val ended = CompletableDeferred<Unit>().also { exerciseEnded = it }
            runCatching { exerciseClient.endExercise() }
                .onFailure { Log.w(TAG, "end exercise failed type=${it::class.java.simpleName}") }
            // Espera la última actualización (métricas finales) un momento.
            withTimeoutOrNull(END_TIMEOUT_MILLIS) { ended.await() }
        }
        if (callbackRegistered) {
            runCatching { exerciseClient.clearUpdateCallback(callback) }
            callbackRegistered = false
        }
        val summary = repository.finalizeSession()
        Log.i(TAG, "walk finished saved=${summary != null}")
        tickerJob?.cancel()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun registerCallback() {
        exerciseClient.setUpdateCallback(callback)
        callbackRegistered = true
    }

    private fun handleUpdate(update: ExerciseUpdate) {
        val metrics = update.latestMetrics
        val steps = metrics.getData(DataType.STEPS_TOTAL)?.total
        val distance = metrics.getData(DataType.DISTANCE_TOTAL)?.total
        val bootInstant = Instant.ofEpochMilli(System.currentTimeMillis() - SystemClock.elapsedRealtime())
        val points = metrics.getData(DataType.LOCATION).map { point ->
            RoutePoint(
                lat = point.value.latitude,
                lng = point.value.longitude,
                t = point.getTimeInstant(bootInstant).toEpochMilli()
            )
        }
        val checkpoint = update.activeDurationCheckpoint
        val state = update.exerciseStateInfo.state

        repository.appendRoute(points)
        if (points.isNotEmpty()) repository.setGpsStatus(GpsStatus.READY)
        repository.mutate { session ->
            session.copy(
                steps = steps ?: session.steps,
                distanceMeters = distance ?: session.distanceMeters,
                activeDurationMillis = checkpoint?.activeDuration?.toMillis() ?: session.activeDurationMillis,
                checkpointAtMillis = checkpoint?.time?.toEpochMilli() ?: session.checkpointAtMillis,
                paused = if (state.isPaused || state.isResuming) state.isPaused else session.paused
            )
        }
        if (state.isEnded) {
            exerciseEnded?.complete(Unit)
            if (!finishing.get()) {
                // Health Services terminó el ejercicio (por ejemplo, se quitó un permiso).
                scope.launch { commands.withLock { finishWalk(endExercise = false) } }
            }
        }
    }

    private fun startTicker() {
        if (tickerJob?.isActive == true) return
        tickerJob = scope.launch {
            while (isActive) {
                delay(NOTIFICATION_UPDATE_MILLIS)
                updateNotification()
            }
        }
    }

    private fun startInForeground(session: WalkSession?): Boolean {
        var type = 0
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
        }
        if (Permissions.hasLocation(this)) {
            type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        }
        return runCatching {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(session), type)
        }.onFailure {
            Log.w(TAG, "startForeground failed type=${it::class.java.simpleName}")
        }.isSuccess
    }

    private fun updateNotification() {
        val session = repository.current() ?: return
        runCatching {
            getSystemService(android.app.NotificationManager::class.java)
                ?.notify(NOTIFICATION_ID, buildNotification(session))
        }
    }

    private fun buildNotification(session: WalkSession?): Notification {
        val now = System.currentTimeMillis()
        val details = if (session == null) {
            ""
        } else {
            listOfNotNull(
                formatDuration(session.activeDurationAt(now) / 1000),
                session.distanceMeters?.let(::formatDistance),
                session.steps?.let { "$it pasos" }
            ).joinToString(" · ")
        }
        val openWalk = PendingIntent.getActivity(
            this,
            NOTIFICATION_ID,
            Intent(this, MainActivity::class.java)
                .putExtra(MainActivity.EXTRA_DESTINATION, MainActivity.DESTINATION_WALK)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        NotificationChannels.create(this)
        return Notification.Builder(this, NotificationChannels.WALK)
            .setSmallIcon(R.drawable.ic_paseo)
            .setContentTitle(
                when {
                    session == null -> "PetWatch"
                    session.paused -> "Paseo en pausa"
                    else -> "Paseo con ${session.petsLabel}"
                }
            )
            .setContentText(details)
            .setCategory(Notification.CATEGORY_WORKOUT)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openWalk)
            .build()
    }

    companion object {
        const val ACTION_START = "com.example.petwatch.walk.START"
        const val ACTION_RESTORE = "com.example.petwatch.walk.RESTORE"
        const val ACTION_PAUSE = "com.example.petwatch.walk.PAUSE"
        const val ACTION_RESUME = "com.example.petwatch.walk.RESUME"
        const val ACTION_FINISH = "com.example.petwatch.walk.FINISH"
        private const val NOTIFICATION_ID = 4_201
        private const val NOTIFICATION_UPDATE_MILLIS = 30_000L
        private const val END_TIMEOUT_MILLIS = 5_000L
        private const val TAG = "PetWatch"

        fun start(context: Context) = sendAction(context, ACTION_START)

        fun restore(context: Context) = sendAction(context, ACTION_RESTORE)

        fun sendAction(context: Context, action: String) {
            val intent = Intent(context, WalkService::class.java).setAction(action)
            runCatching { context.startForegroundService(intent) }
                .onFailure { Log.w(TAG, "cannot start walk service type=${it::class.java.simpleName}") }
        }
    }
}
