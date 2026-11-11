# PetWatch Wear OS

App de Wear OS de PetWatch: tareas de las mascotas con alarmas, paseos con
Health Services e incidentes rápidos. Se vincula con la app móvil (Expo) por un
código de 6 dígitos y habla con Supabase solo mediante Edge Functions.

Stack: Kotlin, Compose for Wear OS Material 3, ViewModel/StateFlow, Ktor,
kotlinx.serialization, Health Services, WorkManager y Tiles. La arquitectura,
la vinculación, las credenciales, el cliente HTTP y las alarmas vienen de
MedTime Watch (`AndroidStudioProjects/Medtime`), con las mismas versiones de
`libs.versions.toml`.

## Qué hace

| Función | Detalle |
| --- | --- |
| Vinculación | Código de 6 dígitos que se aprueba en la app móvil. El `device_token` se guarda cifrado (Android Keystore + AES-GCM). |
| Inicio | Tareas de hoy de todas las mascotas de todos tus hogares (comida, medicamento, paseo, otro). Toca una tarea → **Hecha**, **Posponer** (15/30/60/120 min) u **Omitir**. Botones grandes **Paseo** e **Incidente**. |
| Sin conexión | Muestra los datos guardados. Las acciones sobre tareas quedan en cola y WorkManager las envía después. |
| Alarmas | Alarmas exactas para las tareas pendientes, con pantalla completa y acciones directas. Antes de sonar revisan si otra persona ya hizo la tarea. Se reprograman al reiniciar el reloj y cada hora en segundo plano. |
| Paseo | Elegir una o varias mascotas (de un solo hogar) → Iniciar. `ExerciseClient` con `ExerciseType.WALKING` en un servicio en primer plano (`health` + `location`): tiempo, km, pasos y ruta. Botones **Incidente**, **Pausa** y **Terminar**. El paseo se guarda en el reloj mientras ocurre; al terminar, la ruta se reduce a 2000 puntos y se sube con WorkManager. |
| Incidente | Mascota (se omite en un paseo de una sola mascota) → cuadrícula de tipos. Genera el UUID en el reloj y vibra. En un paseo, guarda la ubicación y viaja con el paseo; si no, se encola. |
| Tile | Accesos rápidos a **Paseo** e **Incidente**. |

## 1. Configurar `local.properties`

Agrega la URL y la clave **publishable** del proyecto de Supabase de PetWatch.
`local.properties` está en `.gitignore`.

```properties
supabase.url=https://<tu-proyecto>.supabase.co
supabase.publishableKey=sb_publishable_...
```

- Están en Supabase → *Project Settings* → *Data API* y *API Keys*.
- Ya se llenaron con los valores de `petwatch/.env.example`.
- **Nunca** pongas la `service_role` ni la *secret key* en el reloj.
- Si faltan, la app compila igual pero muestra «Falta configurar Supabase».

## 2. Backend (migración y Edge Functions)

Está en el proyecto móvil: `OneDrive/Escritorio/aurelioP3/petwatch/supabase`.
La guía completa está en `petwatch/docs/smartwatch/despliegue.md` y el contrato
de las 11 funciones en `petwatch/docs/smartwatch/contrato-api.md`.

Desde la carpeta `petwatch`:

```powershell
npx supabase login
npx supabase link --project-ref <ref-de-tu-proyecto>

# 1) Migración del reloj (requiere la inicial ya aplicada; es una sola transacción)
npx supabase db push --dry-run    # debe listar solo 20261108130000_watch.sql
npx supabase db push              # o pega el archivo en el SQL Editor

# 2) Secreto para los códigos de vinculación (obligatorio)
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $b = New-Object byte[] 32
$rng.GetBytes($b); $salt1 = [Convert]::ToBase64String($b); $rng.GetBytes($b); $salt2 = [Convert]::ToBase64String($b)
npx supabase secrets set "WATCH_PAIRING_CODE_SALT=$salt1" "WATCH_RATE_LIMIT_SALT=$salt2"

# 3) Funciones (config.toml define verify_jwt de cada una)
$functions = "watch-pair-start","watch-pair-preview","watch-pair-approve","watch-pair-status",
  "watch-devices-list","watch-device-revoke","watch-pets-list","watch-tasks-list",
  "watch-task-update","watch-walk-push","watch-incident-push"
foreach ($f in $functions) { npx supabase functions deploy $f; if ($LASTEXITCODE -ne 0) { throw $f } }
```

La app móvil necesita una pantalla para escribir el código (`watch-pair-preview`
y `watch-pair-approve`). Puede reutilizar `src/services/watchService.ts` de
MedTime, porque el contrato de vinculación es el mismo.

## 3. Compilar

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat :app:assembleDebug --no-daemon
```

El APK queda en `app/build/outputs/apk/debug/app-debug.apk`.

> **Avast y dependencias nuevas.** En este equipo, Avast (Web/Mail Shield)
> intercepta HTTPS con su propia CA. Windows confía en ella, pero el JBR no.
> Si agregas una dependencia nueva, Gradle falla con `PKIX path building failed`.
> Android Studio lo resuelve solo. Desde la terminal, usa una copia de `cacerts`
> con la CA de Avast importada (`keytool -importcert`) y pásala en
> `$env:JAVA_TOOL_OPTIONS = '-Djavax.net.ssl.trustStore=<copia> -Djavax.net.ssl.trustStorePassword=changeit'`.
> Con las dependencias ya en caché, el comando de arriba funciona tal cual.

## 4. Instalar y vincular

1. Abre el proyecto en Android Studio y córrelo en un emulador Wear OS (API 30
   o superior; se recomienda Wear OS 4 o 5), o usa
   `adb install -r app/build/outputs/apk/debug/app-debug.apk`.
2. El reloj muestra un código de 6 dígitos (expira en 5 minutos).
3. En la app móvil, con sesión iniciada, escribe el código y aprueba.
4. El reloj recibe su credencial y abre **Hoy**. La credencial dura 30 días;
   si se revoca desde el teléfono, el reloj vuelve a pedir un código.

Permisos: Inicio muestra tarjetas para **Permitir avisos**, **Alarmas exactas**
y **Pantalla completa**. El paseo explica y pide **Actividad física**
(obligatorio, para los pasos) y **Ubicación** (opcional, para la ruta). Para
pruebas rápidas:

```powershell
adb shell pm grant com.example.petwatch android.permission.ACTIVITY_RECOGNITION
adb shell pm grant com.example.petwatch android.permission.ACCESS_FINE_LOCATION
adb shell pm grant com.example.petwatch android.permission.POST_NOTIFICATIONS
adb shell appops set com.example.petwatch SCHEDULE_EXACT_ALARM allow
```

## 5. Simular una caminata en el emulador (datos sintéticos de Health Services)

**Opción A: Android Studio (imágenes Wear OS 4 y 5).** Abre *View > Tool Windows >
Wear Health Services*, activa las capacidades (pasos, distancia, ubicación) y,
con el paseo iniciado, usa *Trigger events* o ajusta los valores de los
sensores.

**Opción B: adb (proveedores sintéticos).** Escribe cada comando en una línea
en PowerShell:

```powershell
# 1. Activar los datos sintéticos
adb shell am broadcast -a "whs.USE_SYNTHETIC_PROVIDERS" com.google.android.wearable.healthservices

# 2. En el reloj: Paseo → elige mascotas → Iniciar. Luego simula la caminata:
adb shell am broadcast -a "whs.synthetic.user.START_WALKING" com.google.android.wearable.healthservices

# 3. Después de unos minutos, detén la actividad sintética y toca Terminar en el reloj
adb shell am broadcast -a "whs.synthetic.user.STOP_EXERCISE" com.google.android.wearable.healthservices

# 4. Volver a los sensores reales
adb shell am broadcast -a "whs.USE_SENSOR_PROVIDERS" com.google.android.wearable.healthservices
```

Para la ruta, usa también *Extended controls (⋯) > Location > Routes* del
emulador: carga o dibuja una ruta y presiona *Play route*. La pantalla del
paseo muestra «GPS listo · N puntos» cuando llegan ubicaciones.

Pruebas útiles:

- **Sobrevive al cierre.** Con el paseo en curso, desliza la app para cerrarla
  (o `adb shell am kill com.example.petwatch`). Al abrirla, el paseo sigue con
  sus datos.
- **Sin conexión.** Activa el modo avión, termina el paseo o registra un
  incidente. Inicio muestra «registro(s) por enviar». Al reconectar,
  WorkManager los sube solo.
- **Alarmas.** Crea en la app móvil un cuidado para dentro de 2 minutos y abre
  Inicio en el reloj: la alarma sonará con pantalla completa.
- **Tile.** Mantén presionada la esfera y agrega «PetWatch: paseo e
  incidente», o:
  `adb shell am broadcast -a com.google.android.wearable.app.DEBUG_SURFACE --es operation add-tile --ecn component com.example.petwatch/com.example.petwatch.presentation.tile.PetWatchTileService`

## Estructura

```
app/src/main/java/com/example/petwatch/presentation/
  MainActivity.kt, PetWatchApplication.kt, AppContainer.kt   (dependencias, como MedTime)
  data/local/       DeviceCredentialStore (Keystore + AES-GCM), CacheStore, OutboxStore,
                    PendingTaskActionStore, WalkStore, JsonFiles
  data/remote/      EdgeFunctionsClient (Ktor), EdgeFunctionModels
  data/model/       Pet, PetTask, Walk (incluye IncidentType)
  data/repository/  Pairing, Pet, Task, Walk, Incident
  data/alarm/       TaskAlarmScheduler, AlarmNotificationManager, receivers, NotificationChannels
  data/sync/        SyncScheduler, TaskActionWorker, OutboxSyncWorker, TaskRefreshWorker
  data/walk/        WalkService (Health Services, primer plano), RouteSimplifier
  navigation/       SwipeDismissableNavHost con la vinculación como puerta de entrada
  ui/               theme, components, screens, alarm (TaskAlarmActivity)
  viewmodel/        Pairing, Home, Walk
  tile/             PetWatchTileService
```

## Decisiones

- **Un paseo es de un solo hogar.** `paseos.hogar_id` es único, así que el
  selector reemplaza la selección si eliges una mascota de otro hogar.
- **El reloj ve todos tus hogares.** Se vincula al usuario, no a un hogar.
- **Acciones de tareas sin conexión.** Quedan en cola y se muestran «sin enviar».
  Una posposición que ya venció no se envía.
- **Incidentes durante un paseo.** Solo se adjuntan al paseo si la mascota va
  en él; los de otras mascotas se encolan como incidentes sueltos.
- **Sin Health Services.** Si el reloj no soporta `WALKING`, el paseo mide solo
  el tiempo. Sin permiso de ubicación, registra pasos y distancia estimada sin ruta.
- **Rechazos definitivos.** Un paseo rechazado (por ejemplo, porque la mascota
  ya no está en tus hogares) queda en «paseo(s) rechazado(s)» para descartarlo,
  y se avisa con una notificación.
