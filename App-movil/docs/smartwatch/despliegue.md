# Despliegue del backend del smartwatch

Nada de esto se ejecuta solo: primero se revisa, después se aplica la migración
y al final se despliegan las funciones.

## Archivos

- `supabase/migrations/20261108130000_watch.sql`
- `supabase/config.toml` (solo secciones `[functions.*]` con `verify_jwt`)
- `supabase/functions/_shared/{http,pairing,server,petwatch}.ts`
- `supabase/functions/watch-pair-{start,preview,approve,status}/index.ts`
- `supabase/functions/watch-devices-list/index.ts`, `watch-device-revoke/index.ts`
- `supabase/functions/watch-{pets-list,tasks-list,task-update,walk-push,incident-push}/index.ts`

## 1. Aplicar la migración

Requiere que la migración inicial de PetWatch ya esté aplicada; si no, la nueva
se detiene sin cambiar nada. También se detiene si ya existen tablas `watch_*`.
Todo corre en una transacción.

**Opción A (SQL Editor):** pega el contenido completo de
`20261108130000_watch.sql` y presiona **Run**.

**Opción B (CLI):**

```powershell
npx supabase login
npx supabase link --project-ref <ref-de-tu-proyecto>
npx supabase db push --dry-run   # debe listar solo 20261108130000_watch.sql
npx supabase db push
```

Además de las tablas `watch_*`, la migración agrega dos triggers a
`tareas_programadas`:

- `tareas_limpiar_dispositivo`: un cambio desde la app deja `dispositivo_id` en `null`.
- `tareas_validar_referencias`: al borrar un usuario o un reloj, `on delete set null`
  funciona también en tareas hechas u omitidas. Antes, `tareas_validar_cambio`
  devolvía la fila anterior y el FK de `hecha_por` impedía borrar a un usuario que
  hubiera completado tareas.

Verificación rápida:

```sql
select tablename from pg_tables where schemaname = 'public' and tablename like 'watch_%';
select column_name from information_schema.columns
where table_name = 'tareas_programadas' and column_name = 'dispositivo_id';
```

## 2. Secretos de las Edge Functions

Supabase inyecta `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Además:

- `WATCH_PAIRING_CODE_SALT` (obligatorio, mínimo 32 caracteres aleatorios).
- `WATCH_RATE_LIMIT_SALT` (recomendado).

```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes); $pairingSalt = [Convert]::ToBase64String($bytes)
$rng.GetBytes($bytes); $rateLimitSalt = [Convert]::ToBase64String($bytes)
$rng.Dispose()
npx supabase secrets set "WATCH_PAIRING_CODE_SALT=$pairingSalt" "WATCH_RATE_LIMIT_SALT=$rateLimitSalt"
Remove-Variable pairingSalt, rateLimitSalt, bytes
npx supabase secrets list   # muestra solo los nombres
```

## 3. Desplegar las funciones

`config.toml` define `verify_jwt` por función (ver `contrato-api.md`).

```powershell
$functions = @(
  "watch-pair-start", "watch-pair-preview", "watch-pair-approve", "watch-pair-status",
  "watch-devices-list", "watch-device-revoke",
  "watch-pets-list", "watch-tasks-list", "watch-task-update", "watch-walk-push", "watch-incident-push"
)
foreach ($function in $functions) {
  npx supabase functions deploy $function
  if ($LASTEXITCODE -ne 0) { throw "Fallo el despliegue de $function" }
}
npx supabase functions list
```

No uses `--no-verify-jwt` en las funciones de la app móvil
(`watch-pair-preview`, `watch-pair-approve`, `watch-devices-list`,
`watch-device-revoke`).

## 4. Prueba de punta a punta

1. En el reloj se muestra un código de 6 dígitos (`watch-pair-start`).
2. En la app móvil, con sesión iniciada, se revisa y aprueba el código
   (`watch-pair-preview` y `watch-pair-approve`).
3. El reloj recibe su token (`watch-pair-status`) y muestra las tareas de hoy.
4. Una tarea marcada en el reloj aparece en la app como hecha por tu usuario.
5. Un paseo o incidente del reloj aparece en la app con origen «Reloj».
6. Revocar el reloj (`watch-device-revoke`) hace que su siguiente llamada
   responda `401` y el reloj pida vincularse de nuevo.

## Errores comunes

- `503 BACKEND_NOT_READY`: falta la migración o `WATCH_PAIRING_CODE_SALT`.
- `401` en el reloj: token expirado (30 días) o revocado; hay que vincularlo de nuevo.
- `401` en la app móvil: sesión expirada. No cambies `verify_jwt` para resolverlo.
- `WALK_MIXED_HOUSEHOLDS`: un paseo solo puede incluir mascotas de un hogar.
