package com.example.petwatch.presentation.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ---------------------------------------------------------------- Vinculación (contrato de MedTime)

@Serializable
data class PairingStartRequest(
    @SerialName("device_name") val deviceName: String,
    @SerialName("device_type") val deviceType: String,
    @SerialName("device_identifier") val deviceIdentifier: String,
    val platform: String? = null
)

@Serializable
data class PairingStartResponse(
    @SerialName("request_id") val requestId: String,
    @SerialName("code") val pairingCode: String,
    @SerialName("challenge_secret") val challengeSecret: String,
    @SerialName("expires_at") val expiresAt: String
)

@Serializable
data class PairingStatusRequest(
    @SerialName("request_id") val requestId: String,
    @SerialName("challenge_secret") val challengeSecret: String
)

@Serializable
data class PairingStatusResponse(
    val status: String,
    @SerialName("device_id") val deviceId: String? = null,
    @SerialName("device_token") val deviceToken: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("token_expires_at") val tokenExpiresAt: String? = null
) {
    fun credentialExpiresAt(): String? = tokenExpiresAt ?: expiresAt
}

/** Cuerpo `{}` para las funciones de listado. */
@Serializable
class EmptyRequest

// ---------------------------------------------------------------- watch-pets-list

@Serializable
data class HouseholdDto(
    val id: String,
    val nombre: String,
    @SerialName("zona_horaria") val zonaHoraria: String? = null
)

@Serializable
data class PetDto(
    val id: String,
    @SerialName("hogar_id") val hogarId: String,
    val nombre: String,
    val especie: String = "otro"
)

@Serializable
data class PetsListResponse(
    val hogares: List<HouseholdDto> = emptyList(),
    val mascotas: List<PetDto> = emptyList()
)

// ---------------------------------------------------------------- watch-tasks-list / watch-task-update

@Serializable
data class PersonDto(
    val id: String,
    val nombre: String? = null
)

@Serializable
data class TaskPetDto(
    val id: String,
    val nombre: String,
    val especie: String = "otro"
)

@Serializable
data class CareDto(
    val id: String,
    val tipo: String,
    val nombre: String,
    val detalle: String? = null
)

@Serializable
data class TaskDto(
    val id: String,
    @SerialName("hogar_id") val hogarId: String,
    @SerialName("programada_para") val programadaPara: String,
    val estado: String,
    @SerialName("pospuesta_hasta") val pospuestaHasta: String? = null,
    @SerialName("hecha_en") val hechaEn: String? = null,
    @SerialName("hecha_por") val hechaPor: PersonDto? = null,
    val mascota: TaskPetDto,
    val cuidado: CareDto
)

@Serializable
data class TasksListResponse(
    val ahora: String? = null,
    val desde: String? = null,
    val hasta: String? = null,
    val tareas: List<TaskDto> = emptyList()
)

@Serializable
data class TaskUpdateRequest(
    @SerialName("tarea_id") val tareaId: String,
    val estado: String,
    @SerialName("posponer_minutos") val posponerMinutos: Int? = null
)

@Serializable
data class TaskUpdateResponse(
    val tarea: TaskDto? = null,
    val idempotente: Boolean = false
)

// ---------------------------------------------------------------- watch-walk-push / watch-incident-push

@Serializable
data class RoutePointDto(
    val lat: Double,
    val lng: Double,
    /** Milisegundos desde epoch. */
    val t: Long? = null
)

@Serializable
data class IncidentDto(
    val id: String,
    @SerialName("mascota_id") val mascotaId: String,
    val tipo: String,
    @SerialName("ocurrido_en") val ocurridoEn: String,
    val lat: Double? = null,
    val lng: Double? = null,
    val nota: String? = null
)

@Serializable
data class WalkPushRequest(
    val id: String,
    @SerialName("mascota_ids") val mascotaIds: List<String>,
    @SerialName("iniciado_en") val iniciadoEn: String,
    @SerialName("terminado_en") val terminadoEn: String,
    @SerialName("duracion_seg") val duracionSeg: Long? = null,
    @SerialName("distancia_m") val distanciaM: Double? = null,
    val pasos: Long? = null,
    val ruta: List<RoutePointDto> = emptyList(),
    val incidentes: List<IncidentDto> = emptyList()
)

@Serializable
data class WalkPushResponse(
    @SerialName("paseo_id") val paseoId: String? = null,
    val idempotente: Boolean = false,
    @SerialName("incidentes_insertados") val incidentesInsertados: Int = 0
)

@Serializable
data class IncidentPushRequest(
    val incidentes: List<IncidentDto>
)

@Serializable
data class RejectedIncidentDto(
    val id: String,
    val motivo: String? = null
)

@Serializable
data class IncidentPushResponse(
    val insertados: List<String> = emptyList(),
    val existentes: List<String> = emptyList(),
    val rechazados: List<RejectedIncidentDto> = emptyList()
)
