import { assertPost, errorResponse, jsonResponse, optionsResponse, readJson } from '../_shared/http.ts';
import { arrayOrEmpty, callWatchRpc } from '../_shared/petwatch.ts';
import { requireDevice } from '../_shared/server.ts';

// Hogares del usuario del reloj y sus mascotas activas.
Deno.serve(async (request) => {
  try {
    if (!assertPost(request)) return optionsResponse();

    const device = await requireDevice(request);
    await readJson(request);

    const result = await callWatchRpc('watch_listar_mascotas', { p_user_id: device.userId });
    return jsonResponse({
      hogares: arrayOrEmpty(result.hogares),
      mascotas: arrayOrEmpty(result.mascotas),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
