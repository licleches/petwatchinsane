# PetWatch

Aplicación móvil para cuidar mascotas en familia, hecha con Expo (SDK 58), React Native, TypeScript, Expo Router y Supabase.

Un **hogar** comparte sus mascotas. Cualquier miembro confirma, pospone u omite tareas, y todos ven en tiempo real quién hizo qué («Desayuno de las 08:00, hecha por Ana a las 08:05»). Desde Ajustes se vincula un smartwatch Wear OS (la app del reloj se hace aparte, en Android Studio).

## Requisitos

- Node.js 20 o superior y npm.
- La app **Expo Go** para SDK 58 en tu teléfono (Android o iOS).
- Un proyecto de [Supabase](https://supabase.com) (puede ser gratuito).

## 1. Instalar dependencias

```bash
npm install
```

## 2. Configurar `.env`

1. Copia el archivo de ejemplo:

   ```bash
   cp .env.example .env
   ```

2. Completa los dos valores con los datos de tu proyecto de Supabase:

   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=tu-clave-publishable
   ```

   - **URL**: Supabase → *Project Settings* → *Data API* → *Project URL*.
   - **Clave**: Supabase → *Project Settings* → *API Keys* → *Publishable key* (`sb_publishable_...`).

> `.env` está en `.gitignore`. Usa solo la clave **publishable**: nunca pongas la `service_role` ni la *secret key* en la app.
> Si cambias `.env`, reinicia Expo limpiando la caché: `npx expo start -c`.

## 3. Aplicar la migración en Supabase

Las migraciones de `supabase/migrations/` se aplican **en orden**:

1. `20261108120000_petwatch_inicial.sql`: el esquema original (ya aplicado en el proyecto actual de Supabase).
2. `20261108125000_ajustes.sql`: borra los objetos del esquema original (sus datos eran de prueba) y crea el esquema que usa la app: tablas, índices, RLS, funciones, el trigger de registro, Realtime y el bucket `fotos-mascotas`.
3. `20261108130000_watch.sql`: el backend del smartwatch (ver la sección 6).

No edites estas migraciones: cualquier cambio de esquema va en una migración nueva (`20261108140000` o posterior).

### Opción A: SQL Editor (la más sencilla)

1. En Supabase abre **SQL Editor** → **New query**.
2. Pega el contenido completo de cada migración que falte en tu proyecto, **una por una y en orden** (por ejemplo `20261108125000_ajustes.sql` y luego `20261108130000_watch.sql`).
3. Presiona **Run** en cada una. Debe terminar con «Success. No rows returned».

### Opción B: Supabase CLI

```bash
npx supabase login
npx supabase link --project-ref <ref-de-tu-proyecto>
npx supabase db push --dry-run         # lista las migraciones pendientes
npx supabase db push
```

### Verificación rápida (SQL Editor)

```sql
-- 12 tablas de PetWatch
select tablename from pg_tables where schemaname = 'public' order by 1;
-- Realtime: incidentes, paseos y tareas_programadas
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
-- Bucket privado de fotos
select id, public from storage.buckets where id = 'fotos-mascotas';
```

## 4. Configurar Auth en Supabase

1. **Confirmación de correo** (*Authentication* → *Sign In / Providers* → *Email*):
   - Para desarrollo, desactiva **Confirm email**: así el registro entra directo a la app, igual que en MedTime.
   - Si la dejas activa, cada usuario debe confirmar su correo antes de iniciar sesión.
2. **URLs de redirección** (*Authentication* → *URL Configuration* → *Redirect URLs*). Agrega:
   - `exp://**` para Expo Go.
   - `petwatch://**` para una build propia.

   El enlace del correo de **recuperar contraseña** vuelve a la app, a la pantalla `/reset-password`, y ahí se crea la nueva contraseña. Ábrelo **en el mismo teléfono** donde corre la app.

## 5. Correr en Expo Go

```bash
npx expo start
```

- **Android**: escanea el código QR con Expo Go.
- **iOS**: escanéalo con la cámara.
- El teléfono y la computadora deben estar en la misma red Wi-Fi. Si no se conecta, usa `npx expo start --tunnel`.

Comandos útiles:

```bash
npm run typecheck   # TypeScript estricto
npm run lint        # ESLint (eslint-config-expo)
```

## 6. Smartwatch (opcional)

Para vincular relojes, el proyecto de Supabase necesita el backend del reloj. Los pasos detallados están en `docs/smartwatch/despliegue.md`:

1. Aplica la migración `supabase/migrations/20261108130000_watch.sql` (después de la inicial).
2. Configura el secreto `WATCH_PAIRING_CODE_SALT`.
3. Despliega las Edge Functions de `supabase/functions`.

Mientras falte algo de esto, **Ajustes → Smartwatch** muestra «Backend del reloj sin configurar» en lugar de fallar.

**Cómo vincular un reloj:**

1. Abre PetWatch en el reloj: muestra un código de 6 dígitos que dura 5 minutos (`watch-pair-start`).
2. En la app ve a **Ajustes → Smartwatch → Vincular reloj** y escribe el código. La app revisa el nombre del reloj (`watch-pair-preview`) y pide tu aprobación (`watch-pair-approve`).
3. El reloj termina de conectarse solo. La pantalla consulta el estado cada 5 segundos mientras el reloj está pendiente.
4. Desde la misma pantalla ves tus relojes (`watch-devices-list`) y puedes desvincular uno (`watch-device-revoke`). Su credencial se revoca al instante y lo que ya registró se conserva.

El reloj se vincula a **tu usuario**: ve las mascotas y tareas de todos tus hogares, y registra paseos, incidentes y tareas a tu nombre. En la app, todo lo que viene del reloj lleva el distintivo **«Registrado desde el reloj ⌚»**: paseos e incidentes con `origen = 'reloj'` o `dispositivo_id`, y tareas con `dispositivo_id`. Aparece en Hoy, en la ficha de cada mascota, en los detalles y en el historial.

## Funcionalidades (Fase 1)

| Pestaña / módulo | Qué hace |
| --- | --- |
| **Auth** | Inicio de sesión, registro (crea tu perfil y tu hogar) y recuperación de contraseña. |
| **Hoy** | Tareas del día de todas las mascotas, agrupadas por hora. Puedes marcarlas como hechas, posponerlas 15, 30, 60 o 120 minutos u omitirlas. Muestra quién las hizo y se actualiza con Realtime. Incluye accesos rápidos a incidente y paseo, y la sugerencia de ir al veterinario. |
| **Mascotas** | Lista con foto, alta y edición con foto (cámara o galería), y archivar o reactivar. |
| **Ficha de mascota** | Pestañas de cuidados y horarios, vacunas (resalta las próximas y las vencidas), visitas al veterinario, incidentes y paseos. |
| **Paseos** | Lista y detalle con mapa de la ruta (si la hay), y gráfica de minutos por semana contra la meta. Permite registrar paseos manuales. |
| **Incidentes** | Vomitó, no comió, cojea, diarrea, se peleó u otro. Aviso en tiempo real a los demás miembros. Con 3 del mismo tipo en 7 días, sugiere ir al veterinario. |
| **Historial** | Línea de tiempo de tareas, incidentes, paseos, vacunas y visitas, con filtros por periodo, tipo y mascota. |
| **Ajustes** | Perfil, hogar (nombre, zona horaria, miembros, invitar por código, unirse a otro hogar), notificaciones locales y la vinculación del smartwatch. |
| **Smartwatch** | Vinculación con código de 6 dígitos, lista de relojes y desvinculación (pantalla `/watch/connect`, adaptada de MedTime). |

Todas las pantallas tienen estados de carga, vacío y error con «Reintentar». No hay datos simulados.

## Cómo funciona

- **Hogares y roles.**
  - Todos los miembros tienen los mismos permisos; el rol `dueño` solo indica quién creó el hogar.
  - Un usuario puede estar en varios hogares. La app trabaja con un **hogar activo**, que se elige en Ajustes (el selector solo aparece si tienes más de uno).
  - Al unirte a otro hogar con un código, el nuevo hogar queda activo. Tu hogar anterior se elimina solo si estaba vacío: sin mascotas, paseos ni otros miembros.
- **Código de invitación.**
  - Tiene 8 caracteres, sin letras confusas (I, L, O). Cualquier miembro puede generarlo y vence a los 7 días.
  - Al generar uno nuevo, el anterior deja de funcionar.
- **Tareas.**
  - La función SQL `generar_tareas` crea las tareas de los **próximos 14 días** con la **zona horaria del hogar**, igual que las dosis de MedTime. Al ser la misma zona para todos, dos miembros en zonas distintas no duplican tareas.
  - La app la llama al abrir Hoy (como máximo cada 15 minutos) y al guardar cuidados.
  - `hecha` y `omitida` son estados finales. `hecha_por` y `hecha_en` los asigna el servidor con el usuario autenticado.
- **Realtime.**
  - Hoy, Historial y la ficha de mascota escuchan cambios en `tareas_programadas`, `incidentes` y `paseos`.
  - Las políticas RLS garantizan que solo lleguen eventos de tus hogares.
- **Notificaciones locales.**
  - Recordatorios de las tareas de los próximos 7 días (máximo 60, por el límite de iOS), con los botones «Hecho» y «Posponer».
  - Se reprograman al abrir la app y cuando otro miembro cambia una tarea.
- **Fotos.**
  - Se guardan en el bucket **privado** `fotos-mascotas`, en la ruta `{hogar_id}/{mascota_id}/...`. Solo los miembros del hogar pueden leerlas o subirlas.
  - `mascotas.foto_url` guarda esa ruta, y la app genera URLs firmadas que duran 1 hora.

### Limitaciones de Expo Go (importante)

- **Avisos de incidentes.**
  - Desde el SDK 53, Expo Go en Android no soporta notificaciones push remotas.
  - Por eso el aviso es una **notificación local** que dispara Realtime: llega mientras la app está abierta o recién minimizada.
  - El push con la app cerrada requiere una *development build* y una Edge Function. Queda para la fase del reloj.
- **Recordatorios de tareas.** Si otro miembro completa una tarea mientras tu app está cerrada, el recordatorio local de tu teléfono podría sonar de todos modos. Al abrir la app se reprograma.
- **Mapas.** En Expo Go, `react-native-maps` funciona sin configurar nada. Para una build propia en Android necesitarás tu propia API key de Google Maps.

## Smartwatch: base de datos y API

El contrato de las Edge Functions está en `docs/smartwatch/contrato-api.md`. Lo principal:

- **Tablas privadas.** `watch_*` (solicitudes, relojes, tokens, rate limits) solo las usan las Edge Functions. La app no puede leerlas: por eso en registros de otros miembros se muestra «Registrado desde el reloj ⌚» sin el nombre del reloj.
- **Origen del registro.** `paseos` e `incidentes` tienen `origen` (`'reloj'` | `'app'`) y `dispositivo_id`. `tareas_programadas.dispositivo_id` guarda el reloj que hizo el último cambio de estado; si después alguien cambia la tarea desde la app, vuelve a `null`.
- **IDs desde el cliente.** `incidentes.id` y `paseos.id` pueden venir del dispositivo. Los reintentos son idempotentes con `INSERT ... ON CONFLICT (id) DO NOTHING`.
- **Formato de la ruta.** `paseos.ruta` es un arreglo JSON `[{"lat": 29.07, "lng": -110.95, "ts": 1731050000000}]`, donde `ts` son milisegundos y es opcional. `paseos.puntos_ruta` es una columna generada con el número de puntos.
- **Ubicación de incidentes.** `incidentes.lat`, `lng` y `paseo_id` sirven para incidentes registrados durante un paseo.

## Estructura

```
src/
  app/                 Rutas (Expo Router)
    (auth)/            login, register, forgot-password
    (tabs)/            index (Hoy), pets, history, settings
    pet/  care/  vaccine/  vet-visit/  incident/  walk/  household/
    watch/             connect (vinculación del smartwatch)
    reset-password.tsx
  components/          common, care, health, history, household, incidents,
                       layout, notifications, pets, settings, tasks, walks, watch
  contexts/            SessionContext, HouseholdContext
  hooks/               useFocusData, useRealtimeRefresh, useNow, usePetPhotoUrl, useSaving
  services/            Acceso a Supabase (auth, hogares, mascotas, tareas, ...)
  utils/               Lógica pura (fechas, horarios, vacunas, incidentes, paseos, historial)
  types/               database.ts (tablas) y watch.ts (API del reloj)
supabase/migrations/   Migración inicial y migración del reloj
supabase/functions/    Edge Functions del reloj (Deno)
docs/smartwatch/       Contrato de la API y despliegue
```

El estilo sigue a MedTime: código en inglés, base de datos e interfaz en español.

## Dependencias

Son las mismas versiones que MedTime (Expo SDK 58.0.20, React Native 0.88, React 19.3, supabase-js 2.118), más cuatro paquetes incluidos en Expo Go:

| Paquete | Para qué |
| --- | --- |
| `react-native-maps` | Mapa de la ruta del paseo y de la ubicación de incidentes. |
| `react-native-svg` | Gráfica propia de minutos de paseo por semana. |
| `expo-image-picker` | Foto de la mascota desde la cámara o la galería. |
| `expo-crypto` | UUID generado en el teléfono para incidentes y paseos, para reintentos sin duplicados. |

`npx expo install --check` sugiere parches más nuevos dentro del SDK 58 (por ejemplo, `expo` 58.0.23). Se mantuvieron las versiones de MedTime. Si Expo Go muestra problemas de compatibilidad, ejecuta `npx expo install --fix`.

## Solución de problemas

- **«Faltan las variables de entorno de Supabase»**: crea `.env` (paso 2) y reinicia con `npx expo start -c`.
- **«Faltan tablas…» o «Falta una función…»**: aplica la migración (paso 3) en el mismo proyecto que configuraste en `.env`.
- **«Supabase rechazó la operación por seguridad»**: tu sesión expiró o ya no perteneces a ese hogar. Cierra sesión y vuelve a entrar.
- **El enlace de recuperación abre el navegador o una página en blanco**: agrega las *Redirect URLs* del paso 4 y abre el enlace en el teléfono donde corre Expo Go.
- **No llegan notificaciones**: revisa en Ajustes del teléfono que Expo Go tenga permiso de notificaciones, y que los interruptores de Ajustes > Notificaciones de PetWatch estén activos.
