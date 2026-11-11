import {
  ApiError,
  assertPost,
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJson,
  requiredString,
  requiredUuid,
} from '../_shared/http.ts';
import { callWatchRpc, POSTPONE_MINUTES, TASK_STATUSES, type TaskStatus } from '../_shared/petwatch.ts';
import { requireDevice } from '../_shared/server.ts';

// Marca una tarea como hecha, pospuesta u omitida desde el reloj.
// hecha_por = usuario del reloj y dispositivo_id = el reloj. Idempotente como
// watch-dose-update de MedTime: repetir un estado final responde 200 sin cambios.
Deno.serve(async (request) => {
  try {
    if (!assertPost(request)) return optionsResponse();

    const device = await requireDevice(request);
    const body = await readJson(request);
    const taskId = requiredUuid(body, 'tarea_id');
    const status = requiredString(body, 'estado', 20) as TaskStatus;
    if (!TASK_STATUSES.includes(status)) {
      throw new ApiError(400, 'INVALID_STATUS', 'La accion para la tarea no es valida.');
    }

    let postponeMinutes: number | null = null;
    if (status === 'pospuesta') {
      const value = body.posponer_minutos;
      if (
        typeof value !== 'number'
        || !Number.isInteger(value)
        || !POSTPONE_MINUTES.includes(value as (typeof POSTPONE_MINUTES)[number])
      ) {
        throw new ApiError(400, 'INVALID_POSTPONEMENT', 'Solo se permiten posposiciones de 15, 30, 60 o 120 minutos.');
      }
      postponeMinutes = value;
    }

    const result = await callWatchRpc('watch_actualizar_tarea', {
      p_user_id: device.userId,
      p_device_id: device.deviceId,
      p_tarea_id: taskId,
      p_estado: status,
      p_posponer_minutos: postponeMinutes,
    });

    if (result.ok !== true) {
      switch (result.reason) {
        case 'not_found':
          throw new ApiError(404, 'TASK_NOT_FOUND', 'No se encontro la tarea solicitada.');
        case 'terminal':
          throw new ApiError(
            409,
            'TASK_TERMINAL',
            result.estado === 'hecha'
              ? 'La tarea ya fue marcada como hecha.'
              : 'La tarea ya fue omitida.',
          );
        case 'invalid_status':
          throw new ApiError(400, 'INVALID_STATUS', 'La accion para la tarea no es valida.');
        case 'invalid_postponement':
          throw new ApiError(400, 'INVALID_POSTPONEMENT', 'Solo se permiten posposiciones de 15, 30, 60 o 120 minutos.');
        default:
          throw new ApiError(409, 'TASK_NOT_UPDATED', 'La tarea cambio antes de completar la operacion.');
      }
    }

    return jsonResponse({ tarea: result.tarea ?? null, idempotente: result.idempotente === true });
  } catch (error) {
    return errorResponse(error);
  }
});
