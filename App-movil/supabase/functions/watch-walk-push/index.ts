import { ApiError, assertPost, errorResponse, jsonResponse, optionsResponse, readJson } from '../_shared/http.ts';
import {
  callWatchRpc,
  dateField,
  incidentListField,
  invalid,
  MAX_DISTANCE_M,
  MAX_STEPS,
  MAX_WALK_INCIDENTS,
  MAX_WALK_SECONDS,
  optionalInteger,
  optionalNumber,
  petIdsField,
  routeField,
  uuidField,
} from '../_shared/petwatch.ts';
import { requireDevice } from '../_shared/server.ts';

const MAX_BODY_BYTES = 512 * 1024;
const DURATION_TOLERANCE_SECONDS = 60;

// Paseo grabado en el reloj: inserta el paseo (origen 'reloj'), paseo_mascotas
// y los incidentes ocurridos durante el paseo en una sola transacción.
// El id lo genera el reloj: si ya existe, responde 200 sin duplicar.
Deno.serve(async (request) => {
  try {
    if (!assertPost(request)) return optionsResponse();

    const device = await requireDevice(request);
    const body = await readJson(request, MAX_BODY_BYTES);
    const now = Date.now();

    const walkId = uuidField(body.id, 'id');
    const petIds = petIdsField(body.mascota_ids, 'mascota_ids');
    const startedAt = dateField(body.iniciado_en, 'iniciado_en', now);
    const endedAt = dateField(body.terminado_en, 'terminado_en', now);
    if (endedAt.getTime() < startedAt.getTime()) {
      invalid('terminado_en debe ser posterior a iniciado_en.', 'INVALID_RANGE');
    }

    const elapsedSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
    if (elapsedSeconds > MAX_WALK_SECONDS) {
      invalid('El paseo no puede durar mas de 24 horas.', 'INVALID_RANGE');
    }
    // duracion_seg (opcional) es el tiempo activo, sin pausas.
    const activeSeconds = optionalInteger(body.duracion_seg, 'duracion_seg', 0, MAX_WALK_SECONDS) ?? elapsedSeconds;
    if (activeSeconds > elapsedSeconds + DURATION_TOLERANCE_SECONDS) {
      invalid('duracion_seg no puede superar el tiempo entre iniciado_en y terminado_en.', 'INVALID_RANGE');
    }

    const distance = optionalNumber(body.distancia_m, 'distancia_m', 0, MAX_DISTANCE_M);
    const steps = optionalInteger(body.pasos, 'pasos', 0, MAX_STEPS);
    const route = routeField(body.ruta);
    const incidents = incidentListField(body.incidentes, 'incidentes', MAX_WALK_INCIDENTS, now, false);
    for (const incident of incidents) {
      if (!petIds.includes(incident.mascota_id)) {
        invalid('Cada incidente del paseo debe ser de una mascota del paseo.', 'INCIDENT_PET_NOT_IN_WALK');
      }
    }

    const result = await callWatchRpc('watch_registrar_paseo', {
      p_user_id: device.userId,
      p_device_id: device.deviceId,
      p_id: walkId,
      p_mascota_ids: petIds,
      p_iniciado_en: startedAt.toISOString(),
      p_terminado_en: endedAt.toISOString(),
      p_duracion_seg: Math.min(activeSeconds, elapsedSeconds),
      p_distancia_m: distance === null ? null : Math.round(distance * 10) / 10,
      p_pasos: steps,
      p_ruta: route,
      p_incidentes: incidents,
    });

    if (result.ok !== true) {
      switch (result.reason) {
        case 'pet_not_found':
          throw new ApiError(404, 'PET_NOT_FOUND', 'Alguna mascota no existe o no pertenece a tus hogares.');
        case 'mixed_households':
          throw new ApiError(400, 'WALK_MIXED_HOUSEHOLDS', 'Todas las mascotas de un paseo deben ser del mismo hogar.');
        case 'incident_pet_not_in_walk':
          throw new ApiError(400, 'INCIDENT_PET_NOT_IN_WALK', 'Cada incidente del paseo debe ser de una mascota del paseo.');
        case 'id_conflict':
          throw new ApiError(409, 'WALK_ID_CONFLICT', 'Ya existe un paseo con ese id que no pertenece a tus hogares.');
        default:
          throw new ApiError(400, 'INVALID_INPUT', 'El paseo no es valido.');
      }
    }

    const idempotent = result.idempotente === true;
    return jsonResponse(
      {
        paseo_id: result.paseo_id ?? walkId,
        idempotente: idempotent,
        incidentes_insertados: typeof result.incidentes_insertados === 'number' ? result.incidentes_insertados : 0,
      },
      idempotent ? 200 : 201,
    );
  } catch (error) {
    return errorResponse(error);
  }
});
