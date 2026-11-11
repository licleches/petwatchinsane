package com.example.petwatch.presentation.data.remote

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.example.petwatch.BuildConfig
import com.example.petwatch.presentation.data.local.DeviceCredential
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import java.io.IOException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Cliente de las Edge Functions del reloj (adaptado de MedTime Watch).
 * Usa la clave publishable en `apikey` y, después de vincular, el device token
 * en `Authorization: Bearer`. Nunca registra cuerpos, tokens ni códigos.
 */
class EdgeFunctionsClient(
    context: Context,
    private val httpClient: HttpClient = createHttpClient()
) {
    private val appContext = context.applicationContext

    private val deviceIdentifier: String by lazy {
        Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID)
            ?.takeIf(String::isNotBlank)
            ?: throw IllegalStateException("El reloj no tiene ANDROID_ID disponible")
    }

    suspend fun startPairing(): PairingStartResponse = post(
        function = "watch-pair-start",
        body = PairingStartRequest(
            deviceName = deviceName(),
            deviceType = "wear_os",
            deviceIdentifier = deviceIdentifier,
            platform = "wearos"
        )
    )

    suspend fun getPairingStatus(requestId: String, challengeSecret: String): PairingStatusResponse =
        post(
            function = "watch-pair-status",
            body = PairingStatusRequest(requestId, challengeSecret)
        )

    suspend fun listPets(credential: DeviceCredential): PetsListResponse =
        post("watch-pets-list", EmptyRequest(), credential)

    suspend fun listTasks(credential: DeviceCredential): TasksListResponse =
        post("watch-tasks-list", EmptyRequest(), credential)

    suspend fun updateTask(
        credential: DeviceCredential,
        taskId: String,
        status: String,
        postponeMinutes: Int?
    ): TaskUpdateResponse {
        require(status in ALLOWED_TASK_STATUSES)
        if (status == "pospuesta") {
            require(postponeMinutes != null && postponeMinutes in ALLOWED_POSTPONE_MINUTES)
        }
        return post(
            function = "watch-task-update",
            body = TaskUpdateRequest(
                tareaId = taskId,
                estado = status,
                posponerMinutos = if (status == "pospuesta") postponeMinutes else null
            ),
            credential = credential
        )
    }

    suspend fun pushWalk(credential: DeviceCredential, request: WalkPushRequest): WalkPushResponse =
        post("watch-walk-push", request, credential)

    suspend fun pushIncidents(
        credential: DeviceCredential,
        request: IncidentPushRequest
    ): IncidentPushResponse = post("watch-incident-push", request, credential)

    private suspend inline fun <reified B : Any, reified T> post(
        function: String,
        body: B,
        credential: DeviceCredential? = null
    ): T {
        val url = functionUrl(function)
        try {
            val response = httpClient.post(url) {
                addCommonHeaders(credential)
                contentType(ContentType.Application.Json)
                setBody(body)
            }
            Log.d(TAG, "function=$function status=${response.status.value}")
            response.requireSuccess(function, hasCredential = credential != null)
            return response.body()
        } catch (error: Exception) {
            Log.w(TAG, "request failed function=$function type=${error::class.java.simpleName}")
            throw error
        }
    }

    private fun HttpRequestBuilder.addCommonHeaders(credential: DeviceCredential?) {
        header("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY)
        if (credential != null) {
            header(HttpHeaders.Authorization, "Bearer ${credential.deviceToken}")
        }
    }

    private suspend fun HttpResponse.requireSuccess(function: String, hasCredential: Boolean) {
        if (status.value in 200..299) return

        val parsedError = runCatching { JSON.decodeFromString<FunctionError>(bodyAsText()) }.getOrNull()
        val errorCode = safeErrorCode(parsedError?.error)
        val errorDetail = safeErrorDetail(parsedError?.message)
        Log.w(TAG, "http error function=$function status=${status.value} errorCode=$errorCode")

        if (hasCredential && (status.value == 401 || status.value == 403)) {
            throw DeviceCredentialRejectedException()
        }
        throw EdgeFunctionException(
            function = function,
            statusCode = status.value,
            errorCode = errorCode,
            errorDetail = errorDetail
        )
    }

    private fun functionUrl(function: String): String {
        val baseUrl = BuildConfig.SUPABASE_URL.trimEnd('/')
        if (!baseUrl.startsWith("https://") || BuildConfig.SUPABASE_PUBLISHABLE_KEY.isBlank()) {
            throw BackendNotConfiguredException()
        }
        return "$baseUrl/functions/v1/$function"
    }

    private fun deviceName(): String {
        val model = Build.MODEL?.trim().orEmpty()
        return (if (model.isBlank()) "PetWatch" else "PetWatch ($model)").take(80)
    }

    private fun safeErrorCode(value: String?): String =
        value?.takeIf { it.matches(SAFE_ERROR_CODE_REGEX) } ?: "unavailable"

    private fun safeErrorDetail(value: String?): String? {
        if (value.isNullOrBlank()) return null
        return value
            .replace(SENSITIVE_VALUE_REGEX, "$1=<redacted>")
            .replace(Regex("\\b\\d{6}\\b"), "<code>")
            .take(MAX_DETAIL_LENGTH)
    }

    companion object {
        private const val TAG = "PetWatch"
        private val SAFE_ERROR_CODE_REGEX = Regex("[A-Za-z0-9_.-]{1,64}")
        private val SENSITIVE_VALUE_REGEX = Regex(
            "(?i)(token|secret|password|challenge_secret|authorization|apikey|key)\\s*[:=]\\s*[^\\s,;}]+"
        )
        private const val MAX_DETAIL_LENGTH = 180
        val ALLOWED_TASK_STATUSES = setOf("hecha", "pospuesta", "omitida")
        val ALLOWED_POSTPONE_MINUTES = setOf(15, 30, 60, 120)

        val JSON = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
        }

        fun createHttpClient(): HttpClient = HttpClient(OkHttp) {
            expectSuccess = false
            install(ContentNegotiation) {
                json(JSON)
            }
            install(HttpTimeout) {
                requestTimeoutMillis = 20_000
                connectTimeoutMillis = 10_000
                socketTimeoutMillis = 20_000
            }
        }
    }
}

@Serializable
private data class FunctionError(
    val error: String? = null,
    val message: String? = null
)

class EdgeFunctionException(
    val function: String,
    val statusCode: Int,
    val errorCode: String = "unavailable",
    val errorDetail: String? = null
) : IllegalStateException("La función $function devolvió HTTP $statusCode") {
    /** 408, 429 y 5xx se reintentan; el resto de errores son definitivos. */
    val isRetryable: Boolean
        get() = statusCode == 408 || statusCode == 429 || statusCode >= 500
}

class DeviceCredentialRejectedException : IllegalStateException(
    "La credencial del reloj ya no es válida"
)

class BackendNotConfiguredException : IllegalStateException(
    "Falta configurar supabase.url y supabase.publishableKey en local.properties"
)

/** Error de red (sin conexión, DNS, TLS, timeout): se puede reintentar más tarde. */
fun Throwable.isNetworkError(): Boolean =
    generateSequence(this) { it.cause }.take(6).any { it is IOException }
