import { ApiError, assertPost, errorResponse, jsonResponse, optionsResponse, readJson } from '../_shared/http.ts';
import { arrayOrEmpty, callWatchRpc, incidentListField, MAX_INCIDENTS_PER_PUSH } from '../_shared/petwatch.ts';
import { requireDevice } from '../_shared/server.ts';

const MAX_BODY_BYTES = 128 * 1024;

// Incidentes registrados en el reloj fuera de un paseo (cola sin conexión).
// Los ids que ya existen se ignoran (`existentes`). Los de mascotas que no son
// de hogares del usuario se rechazan (`rechazados`): el reloj no debe reintentarlos.
Deno.serve(async (request) => {
  try {
    if (!assertPost(request)) return optionsResponse();

    const device = await requireDevice(request);
    const body = await readJson(request, MAX_BODY_BYTES);
    const incidents = incidentListField(body.incidentes, 'incidentes', MAX_INCIDENTS_PER_PUSH, Date.now(), true);

    const result = await callWatchRpc('watch_registrar_incidentes', {
      p_user_id: device.userId,
      p_device_id: device.deviceId,
      p_incidentes: incidents,
    });
    if (result.ok !== true) {
      throw new ApiError(400, 'INVALID_INPUT', 'Los incidentes no son validos.');
    }

    return jsonResponse({
      insertados: arrayOrEmpty(result.insertados),
      existentes: arrayOrEmpty(result.existentes),
      rechazados: arrayOrEmpty(result.rechazados),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
