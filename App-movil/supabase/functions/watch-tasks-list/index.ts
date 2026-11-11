import { assertPost, errorResponse, jsonResponse, optionsResponse, readJson } from '../_shared/http.ts';
import { arrayOrEmpty, callWatchRpc } from '../_shared/petwatch.ts';
import { requireDevice } from '../_shared/server.ts';

const PAST_WINDOW_MS = 12 * 60 * 60 * 1000;
const FUTURE_WINDOW_MS = 36 * 60 * 60 * 1000;
const MAX_TASKS = 200;

// Tareas de todos los hogares del usuario del reloj, desde hace 12 h hasta
// dentro de 36 h (por hora efectiva: pospuesta_hasta o programada_para).
// Antes de consultar genera las tareas de los próximos 3 días.
Deno.serve(async (request) => {
  try {
    if (!assertPost(request)) return optionsResponse();

    const device = await requireDevice(request);
    await readJson(request);

    const now = Date.now();
    const desde = new Date(now - PAST_WINDOW_MS).toISOString();
    const hasta = new Date(now + FUTURE_WINDOW_MS).toISOString();
    const result = await callWatchRpc('watch_listar_tareas', {
      p_user_id: device.userId,
      p_desde: desde,
      p_hasta: hasta,
      p_limite: MAX_TASKS,
    });

    return jsonResponse({
      ahora: new Date(now).toISOString(),
      desde,
      hasta,
      tareas: arrayOrEmpty(result.tareas),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
