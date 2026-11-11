# Contrato de las Edge Functions del smartwatch (PetWatch Wear OS)

Todas las funciones son `POST` con cuerpo JSON (`Content-Type: application/json`)
y responden JSON. Todas las solicitudes llevan el header `apikey` con la clave
**publishable** del proyecto. Nunca se usa `service_role` fuera de las Edge Functions.

La migración es `supabase/migrations/20261108130000_watch.sql`. Las tablas
`watch_*` son privadas: solo las usan estas funciones, mediante funciones SQL
`SECURITY DEFINER` que solo puede ejecutar `service_role`.

## Funciones y credenciales

| Función | La llama | Credencial | `verify_jwt` |
| --- | --- | --- | --- |
| `watch-pair-start` | Reloj | Ninguna (rate limit persistente) | `false` |
| `watch-pair-status` | Reloj | `challenge_secret` en el cuerpo | `false` |
| `watch-pair-preview` | App móvil | JWT de Supabase (sesión) | `true` |
| `watch-pair-approve` | App móvil | JWT de Supabase (sesión) | `true` |
| `watch-devices-list` | App móvil | JWT de Supabase (sesión) | `true` |
| `watch-device-revoke` | App móvil | JWT de Supabase (sesión) | `true` |
| `watch-pets-list` | Reloj | `Authorization: Bearer <device_token>` | `false` |
| `watch-tasks-list` | Reloj | `Authorization: Bearer <device_token>` | `false` |
| `watch-task-update` | Reloj | `Authorization: Bearer <device_token>` | `false` |
| `watch-walk-push` | Reloj | `Authorization: Bearer <device_token>` | `false` |
| `watch-incident-push` | Reloj | `Authorization: Bearer <device_token>` | `false` |

`verify_jwt = false` no significa acceso anónimo: el gateway no puede validar un
device token, así que `requireDevice` (`_shared/server.ts`) lo valida en SQL
(hash SHA-256, expiración, revocación y reloj vinculado). El token dura 30 días;
después el reloj debe vincularse de nuevo.

El reloj se vincula a un **usuario** (`perfiles.id`) y ve **todos los hogares**
a los que ese usuario pertenece.

## Formato de errores (igual que MedTime)

```json
{ "error": "TASK_NOT_FOUND", "message": "No se encontro la tarea solicitada." }
```

| HTTP | Significado | ¿El reloj reintenta? |
| --- | --- | --- |
| `400` | Entrada inválida (`INVALID_INPUT`, `INVALID_JSON`, `INVALID_STATUS`, `INVALID_DATE`, `ROUTE_TOO_LONG`, ...) | No |
| `401` | Credencial inválida, expirada o revocada (`INVALID_DEVICE_TOKEN`, `UNAUTHORIZED`) | No: volver a vincular |
| `404` | No existe o no es de tus hogares (`TASK_NOT_FOUND`, `PET_NOT_FOUND`, `PAIRING_NOT_FOUND`) | No |
| `409` | Conflicto (`TASK_TERMINAL`, `WALK_ID_CONFLICT`, `PAIRING_EXPIRED`, `ACTIVE_REQUEST`, ...) | No |
| `413` | Cuerpo demasiado grande (`PAYLOAD_TOO_LARGE`) | No |
| `429` | Rate limit (`RATE_LIMITED`, `PAIRING_LOCKED`) | Sí, más tarde |
| `5xx` | Backend no disponible (`BACKEND_NOT_READY`, `INTERNAL_ERROR`) | Sí |

Las fechas de las respuestas son ISO-8601 en UTC con milisegundos
(`2026-11-08T15:00:00.000Z`). Las fechas de las solicitudes deben ser ISO-8601
**con zona horaria** (`Z` u offset), no pueden estar más de 5 minutos en el
futuro ni tener más de 90 días.

---

## Vinculación (copiada de MedTime, mismo contrato)

Flujo: el reloj pide un código → la app móvil lo revisa y lo aprueba → el reloj
consulta el estado y recibe su `device_token` una sola vez.

### `watch-pair-start`

```json
{ "device_name": "PetWatch (Pixel Watch 2)", "device_type": "wear_os", "device_identifier": "<ANDROID_ID>" }
```

`201`:

```json
{ "request_id": "uuid", "code": "123456", "challenge_secret": "64 hex", "expires_at": "ISO" }
```

El código expira en 5 minutos. Errores: `400 INVALID_DEVICE_TYPE`,
`409 ACTIVE_REQUEST`, `429 RATE_LIMITED`, `503 BACKEND_NOT_READY` (falta
`WATCH_PAIRING_CODE_SALT` o la migración).

### `watch-pair-preview` (app móvil)

```json
{ "code": "123456" }
```

`200`:

```json
{ "request_id": "uuid", "device_name": "PetWatch (Pixel Watch 2)", "device_type": "wear_os",
  "status": "pending", "expires_at": "ISO", "can_approve": true }
```

### `watch-pair-approve` (app móvil)

```json
{ "request_id": "uuid", "code": "123456" }
```

`200`:

```json
{ "request_id": "uuid", "device_id": "uuid", "status": "pending", "linked_at": null, "expires_at": "ISO" }
```

Vincula el reloj al usuario del JWT. Errores: `409 PAIRING_ALREADY_APPROVED`,
`409 PAIRING_CODE_USED`, `409 PAIRING_EXPIRED`, `409 DEVICE_ALREADY_LINKED`,
`409 PROFILE_MISSING`, `429 PAIRING_LOCKED`.

### `watch-pair-status` (reloj)

```json
{ "request_id": "uuid", "challenge_secret": "64 hex" }
```

Pendiente: `{ "request_id", "status": "pending", "device_id": null, "expires_at" }`.

Aprobada (solo la primera vez):

```json
{ "request_id": "uuid", "status": "linked", "device_id": "uuid",
  "device_token": "64 hex", "token_expires_at": "ISO" }
```

### `watch-devices-list` (app móvil)

Cuerpo `{}`. `200`:

```json
{ "devices": [{ "id": "uuid", "name": "PetWatch (Pixel Watch 2)", "type": "wear_os",
  "identifier": "...", "status": "linked", "linked_at": "ISO", "last_synced_at": "ISO", "created_at": "ISO" }] }
```

### `watch-device-revoke` (app móvil)

```json
{ "device_id": "uuid" }
```

`200`: `{ "device_id", "status": "revoked", "revoked_at" }`. Revoca todos los
tokens del reloj al instante. Error: `404 DEVICE_NOT_FOUND`.

---

## Datos del reloj (header `Authorization: Bearer <device_token>`)

### `watch-pets-list`

Cuerpo `{}`. `200`:

```json
{
  "hogares": [{ "id": "uuid", "nombre": "Hogar de Ana", "zona_horaria": "America/Hermosillo" }],
  "mascotas": [{ "id": "uuid", "hogar_id": "uuid", "nombre": "Firulais", "especie": "perro" }]
}
```

Solo mascotas activas (`activa = true`) de los hogares del usuario.

### `watch-tasks-list`

Cuerpo `{}`. Antes de consultar genera las tareas de los próximos 3 días en
todos los hogares del usuario (`_watch_generar_tareas_usuario`, idempotente).

`200`:

```json
{
  "ahora": "ISO", "desde": "ISO (ahora - 12 h)", "hasta": "ISO (ahora + 36 h)",
  "tareas": [{
    "id": "uuid",
    "hogar_id": "uuid",
    "programada_para": "ISO",
    "estado": "pendiente | hecha | pospuesta | omitida",
    "pospuesta_hasta": "ISO | null",
    "hecha_en": "ISO | null",
    "hecha_por": { "id": "uuid", "nombre": "Ana" },
    "mascota": { "id": "uuid", "nombre": "Firulais", "especie": "perro" },
    "cuidado": { "id": "uuid", "tipo": "comida | medicamento | paseo | otro", "nombre": "Desayuno", "detalle": "1 taza | null" }
  }]
}
```

La ventana usa la **hora efectiva**: `pospuesta_hasta` si la tarea está
pospuesta; si no, `programada_para`. Orden por hora efectiva; máximo 200 tareas.
`hecha_por` es `null` si nadie la resolvió.

### `watch-task-update`

```json
{ "tarea_id": "uuid", "estado": "hecha | pospuesta | omitida", "posponer_minutos": 15 }
```

`posponer_minutos` (15, 30, 60 o 120) es obligatorio solo con `pospuesta`; el
servidor calcula `pospuesta_hasta` con su propia hora.

`200`:

```json
{ "tarea": { "...": "misma forma que watch-tasks-list" }, "idempotente": false }
```

- Guarda `hecha_por` = usuario del reloj (en `hecha` u `omitida`) y
  `dispositivo_id` = el reloj. Si después alguien cambia la tarea desde la app,
  `dispositivo_id` vuelve a `null`.
- Repetir el mismo estado final responde `200` con `idempotente: true`.
- Errores: `400 INVALID_STATUS`, `400 INVALID_POSTPONEMENT`,
  `404 TASK_NOT_FOUND`, `409 TASK_TERMINAL` (ya está hecha u omitida con otro estado).

### `watch-walk-push`

```json
{
  "id": "uuid generado en el reloj",
  "mascota_ids": ["uuid", "uuid"],
  "iniciado_en": "ISO",
  "terminado_en": "ISO",
  "duracion_seg": 1500,
  "distancia_m": 2345.7,
  "pasos": 3100,
  "ruta": [{ "lat": 29.07, "lng": -110.95, "t": 1731050000000 }],
  "incidentes": [{
    "id": "uuid", "mascota_id": "uuid", "tipo": "vomito", "ocurrido_en": "ISO",
    "lat": 29.0705, "lng": -110.9505, "nota": "opcional"
  }]
}
```

- Inserta en una sola transacción el paseo (`origen = 'reloj'`,
  `registrado_por` = usuario del reloj, `dispositivo_id`), `paseo_mascotas` y los
  incidentes (con `paseo_id`).
- Si `id` ya existe en tus hogares: `200` con `idempotente: true`, sin duplicar.
- `duracion_seg` (opcional) es el tiempo activo, sin pausas; si falta se usa
  `terminado_en - iniciado_en`.
- `ruta` se guarda como `paseos.ruta` = `[{lat, lng, ts}]` (`t` → `ts`, en ms).
  Una ruta vacía se guarda como `null`.
- Límites: 1 a 10 mascotas, del **mismo hogar**; ruta de máximo 2000 puntos;
  máximo 50 incidentes; nota de 500 caracteres; paseo de máximo 24 h;
  distancia de 0 a 1,000,000 m; pasos de 0 a 1,000,000; cuerpo de máximo 512 KB.
- Cada incidente debe ser de una mascota del paseo. `lat` y `lng` van juntos o no van.

`201` (nuevo) o `200` (ya existía):

```json
{ "paseo_id": "uuid", "idempotente": false, "incidentes_insertados": 1 }
```

Errores: `400 WALK_MIXED_HOUSEHOLDS`, `400 INCIDENT_PET_NOT_IN_WALK`,
`400 ROUTE_TOO_LONG`, `400 INVALID_RANGE`, `404 PET_NOT_FOUND`,
`409 WALK_ID_CONFLICT`, `413 PAYLOAD_TOO_LARGE`.

### `watch-incident-push`

Incidentes registrados fuera de un paseo (cola sin conexión del reloj):

```json
{ "incidentes": [{ "id": "uuid", "mascota_id": "uuid", "tipo": "no_comio",
  "ocurrido_en": "ISO", "lat": null, "lng": null, "nota": null }] }
```

`tipo`: `vomito`, `no_comio`, `cojea`, `diarrea`, `pelea` u `otro`. De 1 a 50
incidentes por solicitud (cuerpo de máximo 128 KB). `200`:

```json
{ "insertados": ["uuid"], "existentes": ["uuid"], "rechazados": [{ "id": "uuid", "motivo": "mascota_no_encontrada" }] }
```

- `existentes`: el id ya estaba guardado (reintento); se ignora.
- `rechazados`: la mascota no es de tus hogares. No tiene caso reintentarlo.
- El reloj quita de su cola los tres grupos.

---

## Notas para la app móvil

- Para vincular, la app móvil puede reutilizar `src/services/watchService.ts` de
  MedTime: el contrato de vinculación es el mismo.
- Los paseos e incidentes del reloj llegan por Realtime como cualquier otro
  (`origen = 'reloj'`, `dispositivo_id` del reloj).
- `tareas_programadas.dispositivo_id` es nueva: el reloj que hizo el último
  cambio de estado, o `null` si fue la app.
