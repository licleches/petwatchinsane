-- =============================================================================
-- PetWatch · Smartwatch Wear OS (Fase del reloj)
-- =============================================================================
-- Requiere la migración inicial 20261108120000_petwatch_inicial.sql.
-- Cómo aplicarla: SQL Editor de Supabase o `npx supabase db push`
-- (ver docs/smartwatch/despliegue.md). Corre en una sola transacción: si algo
-- falla, no se aplica ningún cambio.
--
-- Qué crea (adaptado de MedTime Watch):
--   * Tablas privadas watch_* para la vinculación segura: solicitudes, relojes,
--     tokens del reloj y rate limits. Solo las usan las Edge Functions mediante
--     funciones SECURITY DEFINER; la app no las ve directamente.
--   * El reloj se vincula a un USUARIO (perfiles.id) y ve todos los hogares a los
--     que ese usuario pertenece.
--   * tareas_programadas.dispositivo_id (nueva) y FKs de dispositivo_id en
--     tareas_programadas, paseos e incidentes hacia watch_devices
--     (on delete set null).
--   * Funciones internas (solo service_role) para las Edge Functions del reloj:
--     mascotas, tareas (con generación), cambio de estado, paseos e incidentes.
--
-- No modifica la migración inicial ni sus funciones.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Verificaciones previas (falla cerrada)
-- -----------------------------------------------------------------------------
do $$
declare
  missing_tables text;
  existing_tables text;
begin
  select string_agg(t.name, ', ' order by t.name)
  into missing_tables
  from unnest(array[
    'perfiles', 'hogares', 'hogar_miembros', 'mascotas', 'cuidados', 'horarios_cuidado',
    'tareas_programadas', 'paseos', 'paseo_mascotas', 'incidentes'
  ]) as t(name)
  where to_regclass('public.' || t.name) is null;

  if missing_tables is not null then
    raise exception 'Falta la migración inicial de PetWatch (no existen: %). No se aplicaron cambios.', missing_tables;
  end if;

  select string_agg(table_name, ', ' order by table_name)
  into existing_tables
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'watch_pairing_requests',
      'watch_devices',
      'watch_device_tokens',
      'watch_pairing_rate_limits'
    );

  if existing_tables is not null then
    raise exception 'Ya existen tablas watch_*: %. Revisa el esquema; no se aplicaron cambios.', existing_tables;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tareas_programadas'
      and column_name = 'dispositivo_id'
  ) then
    raise exception 'tareas_programadas.dispositivo_id ya existe. Revisa el esquema; no se aplicaron cambios.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Tablas watch_* (privadas)
-- -----------------------------------------------------------------------------
create table public.watch_pairing_requests (
  id uuid primary key,
  pairing_code_hash text not null check (length(pairing_code_hash) = 64),
  challenge_secret_hash text not null check (length(challenge_secret_hash) = 64),
  device_name text not null check (char_length(device_name) between 1 and 80),
  device_identifier text not null check (char_length(device_identifier) between 1 and 200),
  device_type text not null default 'wear_os' check (device_type = 'wear_os'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'claimed', 'expired', 'locked', 'revoked')),
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  approved_user_id uuid references public.perfiles (id) on delete set null,
  approved_at timestamptz,
  claimed_at timestamptz,
  code_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.watch_pairing_requests is 'Solicitudes de vinculación del reloj (código de 6 dígitos, expiran en 5 minutos). Privada: solo Edge Functions.';

create table public.watch_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.perfiles (id) on delete cascade,
  pairing_request_id uuid not null unique references public.watch_pairing_requests (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  device_type text not null default 'wear_os' check (device_type = 'wear_os'),
  device_identifier text not null check (char_length(device_identifier) between 1 and 200),
  status text not null default 'pending' check (status in ('pending', 'linked', 'revoked')),
  linked_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.watch_devices is 'Relojes vinculados. Cada reloj pertenece a un usuario (perfiles.id) y ve todos sus hogares.';

create table public.watch_device_tokens (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.watch_devices (id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.watch_device_tokens is 'Hash SHA-256 del device_token del reloj. El token nunca se guarda en texto plano.';

create table public.watch_pairing_rate_limits (
  key_hash text primary key check (length(key_hash) = 64),
  window_started_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

create unique index watch_pairing_active_device_identifier_idx
on public.watch_pairing_requests (device_identifier)
where status in ('pending', 'approved');

create unique index watch_pairing_active_code_idx
on public.watch_pairing_requests (pairing_code_hash)
where status in ('pending', 'approved');

create unique index watch_devices_active_owner_identifier_idx
on public.watch_devices (user_id, device_identifier)
where status <> 'revoked';

create index watch_pairing_requests_status_expiry_idx
on public.watch_pairing_requests (status, expires_at);

create index watch_pairing_requests_approved_user_idx
on public.watch_pairing_requests (approved_user_id)
where approved_user_id is not null;

create index watch_devices_user_status_idx
on public.watch_devices (user_id, status, created_at desc);

create index watch_device_tokens_device_active_idx
on public.watch_device_tokens (device_id, expires_at)
where revoked_at is null;

create index watch_pairing_rate_limits_updated_at_idx
on public.watch_pairing_rate_limits (updated_at);

create function public.watch_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger watch_pairing_requests_updated_at
before update on public.watch_pairing_requests
for each row execute function public.watch_set_updated_at();

create trigger watch_devices_updated_at
before update on public.watch_devices
for each row execute function public.watch_set_updated_at();

create trigger watch_pairing_rate_limits_updated_at
before update on public.watch_pairing_rate_limits
for each row execute function public.watch_set_updated_at();

alter table public.watch_pairing_requests enable row level security;
alter table public.watch_devices enable row level security;
alter table public.watch_device_tokens enable row level security;
alter table public.watch_pairing_rate_limits enable row level security;

-- Sin políticas: anon y authenticated no tienen acceso. Las funciones
-- SECURITY DEFINER de abajo usan los privilegios de su dueño.
revoke all on table public.watch_pairing_requests from anon, authenticated, public, service_role;
revoke all on table public.watch_devices from anon, authenticated, public, service_role;
revoke all on table public.watch_device_tokens from anon, authenticated, public, service_role;
revoke all on table public.watch_pairing_rate_limits from anon, authenticated, public, service_role;

-- watch-devices-list consulta los relojes directamente (sin tokens).
grant select on table public.watch_devices to service_role;

-- -----------------------------------------------------------------------------
-- 2. dispositivo_id en tareas, paseos e incidentes
-- -----------------------------------------------------------------------------
alter table public.tareas_programadas
  add column dispositivo_id uuid references public.watch_devices (id) on delete set null;
comment on column public.tareas_programadas.dispositivo_id is 'Reloj que hizo el último cambio de estado. null si el cambio vino de la app.';

-- paseos e incidentes ya tenían dispositivo_id sin FK. Antes de esta migración no
-- existían relojes, así que ningún valor previo puede apuntar a uno.
do $$
declare
  v_paseos integer;
  v_incidentes integer;
begin
  update public.paseos set dispositivo_id = null where dispositivo_id is not null;
  get diagnostics v_paseos = row_count;
  update public.incidentes set dispositivo_id = null where dispositivo_id is not null;
  get diagnostics v_incidentes = row_count;
  if v_paseos > 0 or v_incidentes > 0 then
    raise notice 'Se limpiaron dispositivo_id sin reloj: % paseos, % incidentes.', v_paseos, v_incidentes;
  end if;
end;
$$;

alter table public.paseos
  add constraint paseos_dispositivo_id_fkey
  foreign key (dispositivo_id) references public.watch_devices (id) on delete set null;

alter table public.incidentes
  add constraint incidentes_dispositivo_id_fkey
  foreign key (dispositivo_id) references public.watch_devices (id) on delete set null;

create index tareas_dispositivo_idx on public.tareas_programadas (dispositivo_id) where dispositivo_id is not null;
create index paseos_dispositivo_idx on public.paseos (dispositivo_id) where dispositivo_id is not null;
create index incidentes_dispositivo_idx on public.incidentes (dispositivo_id) where dispositivo_id is not null;

-- Un cambio de estado hecho desde la app (usuario autenticado) no viene de un
-- reloj: se limpia dispositivo_id. Las Edge Functions usan service_role
-- (auth.uid() es null) y asignan dispositivo_id explícitamente.
-- Corre antes de tareas_validar_cambio (orden alfabético): si esa función
-- descarta el cambio (estado final repetido), el valor anterior se conserva.
create function public.tareas_limpiar_dispositivo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.dispositivo_id := null;
  end if;
  return new;
end;
$$;

create trigger tareas_limpiar_dispositivo
before update on public.tareas_programadas
for each row execute function public.tareas_limpiar_dispositivo();

-- `on delete set null` hace un UPDATE en tareas_programadas. En tareas hechas u
-- omitidas, tareas_validar_cambio devuelve la fila anterior y el FK fallaría
-- (borrar un usuario o su reloj daría error). Este trigger corre DESPUÉS de
-- tareas_validar_cambio (orden alfabético) y solo anula referencias a filas que
-- ya no existen; no cambia nada más. SECURITY DEFINER porque la app no puede
-- leer watch_devices.
create function public.tareas_limpiar_referencias_borradas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.hecha_por is not null
    and not exists (select 1 from public.perfiles where id = new.hecha_por) then
    new.hecha_por := null;
  end if;
  if new.dispositivo_id is not null
    and not exists (select 1 from public.watch_devices where id = new.dispositivo_id) then
    new.dispositivo_id := null;
  end if;
  return new;
end;
$$;

create trigger tareas_validar_referencias
before update on public.tareas_programadas
for each row execute function public.tareas_limpiar_referencias_borradas();

-- -----------------------------------------------------------------------------
-- 3. Vinculación (copiado de MedTime Watch; usuario = perfiles.id)
-- -----------------------------------------------------------------------------
create function public.watch_start_pairing(
  p_request_id uuid,
  p_pairing_code_hash text,
  p_challenge_secret_hash text,
  p_device_name text,
  p_device_identifier text,
  p_device_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.watch_pairing_requests%rowtype;
begin
  if p_request_id is null
    or p_device_type is distinct from 'wear_os'
    or pg_catalog.char_length(coalesce(p_device_name, '')) not between 1 and 80
    or pg_catalog.char_length(coalesce(p_device_identifier, '')) not between 1 and 200
    or p_pairing_code_hash is null
    or p_pairing_code_hash !~ '^[0-9a-f]{64}$'
    or p_challenge_secret_hash is null
    or p_challenge_secret_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Parametros de pairing invalidos';
  end if;

  -- Serializa los inicios del mismo reloj: expirar y crear es una sola transacción.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_device_identifier));

  update public.watch_pairing_requests
  set status = 'expired'
  where device_identifier = p_device_identifier
    and status in ('pending', 'approved')
    and expires_at <= pg_catalog.now();

  update public.watch_devices
  set status = 'revoked', revoked_at = pg_catalog.now()
  where device_identifier = p_device_identifier
    and status = 'pending'
    and pairing_request_id in (
      select id
      from public.watch_pairing_requests
      where device_identifier = p_device_identifier
        and status = 'expired'
    );

  if exists (
    select 1
    from public.watch_pairing_requests
    where device_identifier = p_device_identifier
      and status in ('pending', 'approved')
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'active_request');
  end if;

  insert into public.watch_pairing_requests (
    id,
    pairing_code_hash,
    challenge_secret_hash,
    device_name,
    device_identifier,
    device_type,
    expires_at,
    max_attempts
  )
  values (
    p_request_id,
    p_pairing_code_hash,
    p_challenge_secret_hash,
    p_device_name,
    p_device_identifier,
    p_device_type,
    pg_catalog.now() + interval '5 minutes',
    5
  )
  returning * into pairing;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'request_id', pairing.id,
    'expires_at', pairing.expires_at
  );
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'code_collision');
end;
$$;

create function public.watch_consume_rate_limit(
  p_key_hash text,
  p_window_seconds integer,
  p_max_attempts integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_limit public.watch_pairing_rate_limits%rowtype;
begin
  if pg_catalog.length(coalesce(p_key_hash, '')) <> 64
    or p_window_seconds is null
    or p_window_seconds <= 0
    or p_max_attempts is null
    or p_max_attempts <= 0 then
    raise exception 'Parametros de rate limit invalidos';
  end if;

  insert into public.watch_pairing_rate_limits (key_hash, window_started_at, attempts)
  values (p_key_hash, pg_catalog.now(), 0)
  on conflict (key_hash) do nothing;

  select *
  into current_limit
  from public.watch_pairing_rate_limits
  where key_hash = p_key_hash
  for update;

  if current_limit.window_started_at <= pg_catalog.now() - (p_window_seconds || ' seconds')::interval then
    update public.watch_pairing_rate_limits
    set window_started_at = pg_catalog.now(), attempts = 1
    where key_hash = p_key_hash;
    return true;
  end if;

  if current_limit.attempts >= p_max_attempts then
    return false;
  end if;

  update public.watch_pairing_rate_limits
  set attempts = current_limit.attempts + 1
  where key_hash = p_key_hash;
  return true;
end;
$$;

create function public.watch_pair_preview(
  p_request_id uuid,
  p_pairing_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.watch_pairing_requests%rowtype;
begin
  select *
  into pairing
  from public.watch_pairing_requests
  where (
      p_request_id is not null
      and id = p_request_id
    )
    or (
      p_request_id is null
      and pairing_code_hash = p_pairing_code_hash
      and status in ('pending', 'approved')
    )
  order by created_at desc
  limit 1
  for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', case when p_request_id is null then 'invalid_code' else 'not_found' end
    );
  end if;

  if pairing.status in ('pending', 'approved') and pairing.expires_at <= pg_catalog.now() then
    update public.watch_pairing_requests
    set status = 'expired'
    where id = pairing.id;
    update public.watch_devices
    set status = 'revoked', revoked_at = pg_catalog.now()
    where pairing_request_id = pairing.id
      and status = 'pending';
    pairing.status := 'expired';
  end if;

  if pairing.code_used_at is not null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'used');
  end if;

  if pairing.status in ('expired', 'locked', 'revoked') then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', pairing.status);
  end if;

  if pairing.pairing_code_hash <> p_pairing_code_hash then
    update public.watch_pairing_requests
    set attempt_count = attempt_count + 1,
        status = case when attempt_count + 1 >= max_attempts then 'locked' else status end
    where id = pairing.id
    returning * into pairing;

    if pairing.status = 'locked' then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'locked');
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'request_id', pairing.id,
    'device_name', pairing.device_name,
    'device_type', pairing.device_type,
    'status', pairing.status,
    'expires_at', pairing.expires_at,
    'can_approve', pairing.status = 'pending'
  );
end;
$$;

create function public.watch_pair_approve(
  p_request_id uuid,
  p_pairing_code_hash text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.watch_pairing_requests%rowtype;
  device public.watch_devices%rowtype;
begin
  select *
  into pairing
  from public.watch_pairing_requests
  where id = p_request_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if pairing.status in ('pending', 'approved') and pairing.expires_at <= pg_catalog.now() then
    update public.watch_pairing_requests
    set status = 'expired'
    where id = pairing.id;
    update public.watch_devices
    set status = 'revoked', revoked_at = pg_catalog.now()
    where pairing_request_id = pairing.id
      and status = 'pending';
    pairing.status := 'expired';
  end if;

  if pairing.code_used_at is not null then
    if p_pairing_code_hash is null or pairing.pairing_code_hash <> p_pairing_code_hash then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'used');
    end if;

    if pairing.status not in ('approved', 'claimed') then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'used');
    end if;

    if pairing.approved_user_id is distinct from p_user_id then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'already_approved');
    end if;

    select *
    into device
    from public.watch_devices
    where pairing_request_id = pairing.id
    for update;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_ready');
    end if;

    if device.status = 'revoked' or device.revoked_at is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_revoked');
    end if;

    return pg_catalog.jsonb_build_object(
      'ok', true,
      'request_id', pairing.id,
      'device_id', device.id,
      'status', device.status,
      'linked_at', device.linked_at,
      'expires_at', pairing.expires_at
    );
  end if;

  if pairing.status in ('expired', 'locked', 'revoked') then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', pairing.status);
  end if;

  if pairing.pairing_code_hash <> p_pairing_code_hash then
    update public.watch_pairing_requests
    set attempt_count = attempt_count + 1,
        status = case when attempt_count + 1 >= max_attempts then 'locked' else status end
    where id = pairing.id
    returning * into pairing;

    if pairing.status = 'locked' then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'locked');
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  if pairing.status in ('approved', 'claimed') then
    if pairing.approved_user_id is distinct from p_user_id then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'already_approved');
    end if;

    select *
    into device
    from public.watch_devices
    where pairing_request_id = pairing.id;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_ready');
    end if;

    if device.status = 'revoked' or device.revoked_at is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_revoked');
    end if;

    return pg_catalog.jsonb_build_object(
      'ok', true,
      'request_id', pairing.id,
      'device_id', device.id,
      'status', device.status,
      'linked_at', device.linked_at,
      'expires_at', pairing.expires_at
    );
  end if;

  -- PetWatch: el reloj se vincula a un perfil (lo crea el trigger de registro).
  if not exists (select 1 from public.perfiles where id = p_user_id) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'profile_missing');
  end if;

  if exists (
    select 1
    from public.watch_devices
    where user_id = p_user_id
      and device_identifier = pairing.device_identifier
      and status <> 'revoked'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_exists');
  end if;

  insert into public.watch_devices (
    user_id,
    pairing_request_id,
    name,
    device_type,
    device_identifier,
    status
  )
  values (
    p_user_id,
    pairing.id,
    pairing.device_name,
    pairing.device_type,
    pairing.device_identifier,
    'pending'
  )
  returning * into device;

  update public.watch_pairing_requests
  set status = 'approved',
      approved_user_id = p_user_id,
      approved_at = pg_catalog.now(),
      code_used_at = pg_catalog.now()
  where id = pairing.id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'request_id', pairing.id,
    'device_id', device.id,
    'status', device.status,
    'linked_at', device.linked_at,
    'expires_at', pairing.expires_at
  );
end;
$$;

create function public.watch_pair_claim_token(
  p_request_id uuid,
  p_challenge_secret_hash text,
  p_token_hash text,
  p_token_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.watch_pairing_requests%rowtype;
  device public.watch_devices%rowtype;
begin
  if pg_catalog.length(coalesce(p_challenge_secret_hash, '')) <> 64
    or pg_catalog.length(coalesce(p_token_hash, '')) <> 64
    or p_token_expires_at is null
    or p_token_expires_at <= pg_catalog.now()
    or p_token_expires_at > pg_catalog.now() + interval '31 days' then
    raise exception 'Credencial de dispositivo invalida';
  end if;

  select *
  into pairing
  from public.watch_pairing_requests
  where id = p_request_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if pairing.challenge_secret_hash <> p_challenge_secret_hash then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_challenge');
  end if;

  if pairing.status in ('pending', 'approved') and pairing.expires_at <= pg_catalog.now() then
    update public.watch_pairing_requests
    set status = 'expired'
    where id = pairing.id;
    update public.watch_devices
    set status = 'revoked', revoked_at = pg_catalog.now()
    where pairing_request_id = pairing.id
      and status = 'pending';
    pairing.status := 'expired';
  end if;

  if pairing.status = 'pending' then
    return pg_catalog.jsonb_build_object('ok', true, 'status', 'pending', 'expires_at', pairing.expires_at);
  end if;

  if pairing.status = 'approved' then
    select *
    into device
    from public.watch_devices
    where pairing_request_id = pairing.id
    for update;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_ready');
    end if;

    if device.status = 'revoked' or device.revoked_at is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_revoked');
    end if;

    if device.status <> 'pending' then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_ready');
    end if;

    insert into public.watch_device_tokens (device_id, token_hash, expires_at)
    values (device.id, p_token_hash, p_token_expires_at);

    update public.watch_devices
    set status = 'linked', linked_at = pg_catalog.now(), last_seen_at = pg_catalog.now()
    where id = device.id;

    update public.watch_pairing_requests
    set status = 'claimed', claimed_at = pg_catalog.now()
    where id = pairing.id;

    return pg_catalog.jsonb_build_object(
      'ok', true,
      'status', 'linked',
      'token_issued', true,
      'device_id', device.id,
      'token_expires_at', p_token_expires_at
    );
  end if;

  if pairing.status = 'claimed' then
    select *
    into device
    from public.watch_devices
    where pairing_request_id = pairing.id
    for update;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_ready');
    end if;

    if device.status = 'revoked' or device.revoked_at is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_revoked');
    end if;

    if device.status <> 'linked' then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_ready');
    end if;

    return pg_catalog.jsonb_build_object(
      'ok', true,
      'status', 'linked',
      'token_issued', false,
      'device_id', device.id,
      'linked_at', device.linked_at
    );
  end if;

  return pg_catalog.jsonb_build_object('ok', false, 'reason', pairing.status);
end;
$$;

create function public.watch_authenticate_device(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row record;
begin
  select
    tokens.id as token_id,
    devices.id as device_id,
    devices.user_id
  into token_row
  from public.watch_device_tokens as tokens
  join public.watch_devices as devices on devices.id = tokens.device_id
  where tokens.token_hash = p_token_hash
    and tokens.revoked_at is null
    and tokens.expires_at > pg_catalog.now()
    and devices.status = 'linked'
    and devices.revoked_at is null;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_device_token');
  end if;

  update public.watch_device_tokens
  set last_used_at = pg_catalog.now()
  where id = token_row.token_id;

  update public.watch_devices
  set last_seen_at = pg_catalog.now()
  where id = token_row.device_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'device_id', token_row.device_id,
    'user_id', token_row.user_id
  );
end;
$$;

create function public.watch_revoke_device(
  p_user_id uuid,
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.watch_pairing_requests%rowtype;
  pairing_request_id uuid;
  revoked_device public.watch_devices%rowtype;
begin
  select devices.pairing_request_id
  into pairing_request_id
  from public.watch_devices as devices
  where devices.id = p_device_id
    and devices.user_id = p_user_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select *
  into pairing
  from public.watch_pairing_requests as requests
  where requests.id = pairing_request_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.watch_devices
  set status = 'revoked', revoked_at = pg_catalog.now()
  where public.watch_devices.id = p_device_id
    and public.watch_devices.user_id = p_user_id
    and status <> 'revoked'
  returning * into revoked_device;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.watch_device_tokens
  set revoked_at = pg_catalog.now()
  where device_id = p_device_id
    and revoked_at is null;

  update public.watch_pairing_requests
  set status = 'revoked'
  where id = revoked_device.pairing_request_id
    and status in ('pending', 'approved');

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'device_id', revoked_device.id,
    'status', revoked_device.status,
    'revoked_at', revoked_device.revoked_at
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Datos del reloj (solo service_role, llamadas desde las Edge Functions)
-- -----------------------------------------------------------------------------

-- Fecha ISO-8601 en UTC con milisegundos ("2026-11-08T15:00:00.000Z"), igual
-- que Date.toISOString(): el reloj la interpreta sin depender de la zona de la sesión.
create function public._watch_iso(p_valor timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.to_char(p_valor at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- Variante interna de generar_tareas: genera las tareas de los próximos p_dias
-- días en TODOS los hogares del usuario del reloj (no usa auth.uid()).
-- Idempotente (usa _generar_tareas_hogar, ON CONFLICT DO NOTHING).
create function public._watch_generar_tareas_usuario(p_user_id uuid, p_dias integer default 3)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hogar_id uuid;
  v_total integer := 0;
begin
  if p_dias is null or p_dias not between 1 and 31 then
    raise exception 'El número de días debe estar entre 1 y 31.' using errcode = '22023';
  end if;

  for v_hogar_id in
    select hm.hogar_id from public.hogar_miembros as hm where hm.usuario_id = p_user_id
  loop
    v_total := v_total + public._generar_tareas_hogar(v_hogar_id, p_dias);
  end loop;
  return v_total;
end;
$$;

-- Una tarea con su mascota, cuidado y quién la resolvió (forma de la API del reloj).
create function public._watch_tarea_json(p_tarea_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', t.id,
    'hogar_id', t.hogar_id,
    'programada_para', public._watch_iso(t.programada_para),
    'estado', t.estado,
    'pospuesta_hasta', public._watch_iso(t.pospuesta_hasta),
    'hecha_en', public._watch_iso(t.hecha_en),
    'hecha_por', case
      when p.id is null then null
      else pg_catalog.jsonb_build_object('id', p.id, 'nombre', p.nombre)
    end,
    'mascota', pg_catalog.jsonb_build_object('id', m.id, 'nombre', m.nombre, 'especie', m.especie),
    'cuidado', pg_catalog.jsonb_build_object('id', c.id, 'tipo', c.tipo, 'nombre', c.nombre, 'detalle', c.detalle)
  )
  from public.tareas_programadas as t
  join public.horarios_cuidado as h on h.id = t.horario_id
  join public.cuidados as c on c.id = h.cuidado_id
  join public.mascotas as m on m.id = t.mascota_id
  left join public.perfiles as p on p.id = t.hecha_por
  where t.id = p_tarea_id;
$$;

-- Hogares del usuario y sus mascotas activas.
create function public.watch_listar_mascotas(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'hogares', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', h.id, 'nombre', h.nombre, 'zona_horaria', h.zona_horaria)
        order by h.nombre, h.id
      )
      from public.hogares as h
      join public.hogar_miembros as hm on hm.hogar_id = h.id
      where hm.usuario_id = p_user_id
    ), '[]'::jsonb),
    'mascotas', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', m.id, 'hogar_id', m.hogar_id, 'nombre', m.nombre, 'especie', m.especie)
        order by m.nombre, m.id
      )
      from public.mascotas as m
      join public.hogar_miembros as hm on hm.hogar_id = m.hogar_id
      where hm.usuario_id = p_user_id
        and m.activa
    ), '[]'::jsonb)
  );
$$;

-- Tareas cuya hora efectiva (pospuesta_hasta o programada_para) cae en
-- [p_desde, p_hasta). Antes genera las de los próximos 3 días.
create function public.watch_listar_tareas(
  p_user_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_limite integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite integer := greatest(1, least(coalesce(p_limite, 200), 500));
  v_tareas jsonb;
begin
  if p_user_id is null
    or p_desde is null
    or p_hasta is null
    or p_hasta <= p_desde
    or p_hasta - p_desde > interval '3 days' then
    raise exception 'Rango de tareas invalido' using errcode = '22023';
  end if;

  perform public._watch_generar_tareas_usuario(p_user_id, 3);

  select coalesce(pg_catalog.jsonb_agg(public._watch_tarea_json(x.id) order by x.efectiva, x.id), '[]'::jsonb)
  into v_tareas
  from (
    select t.id, coalesce(t.pospuesta_hasta, t.programada_para) as efectiva
    from public.tareas_programadas as t
    where t.hogar_id in (
        select hm.hogar_id from public.hogar_miembros as hm where hm.usuario_id = p_user_id
      )
      and (
        (t.programada_para >= p_desde and t.programada_para < p_hasta)
        or (t.estado = 'pospuesta' and t.pospuesta_hasta >= p_desde and t.pospuesta_hasta < p_hasta)
      )
    order by 2, 1
    limit v_limite
  ) as x;

  return pg_catalog.jsonb_build_object('tareas', v_tareas);
end;
$$;

-- Cambia el estado de una tarea desde el reloj. Idempotente como
-- watch-dose-update: repetir un estado final devuelve la tarea sin cambios.
-- hecha_por = usuario del reloj (el trigger usa auth.uid(), que aquí es null).
create function public.watch_actualizar_tarea(
  p_user_id uuid,
  p_device_id uuid,
  p_tarea_id uuid,
  p_estado text,
  p_posponer_minutos integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tarea public.tareas_programadas%rowtype;
begin
  if p_estado is null or p_estado not in ('hecha', 'pospuesta', 'omitida') then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_status');
  end if;
  if p_estado = 'pospuesta'
    and (p_posponer_minutos is null or p_posponer_minutos not in (15, 30, 60, 120)) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_postponement');
  end if;

  select t.*
  into v_tarea
  from public.tareas_programadas as t
  where t.id = p_tarea_id
    and exists (
      select 1
      from public.hogar_miembros as hm
      where hm.hogar_id = t.hogar_id
        and hm.usuario_id = p_user_id
    )
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_tarea.estado in ('hecha', 'omitida') then
    if v_tarea.estado = p_estado then
      return pg_catalog.jsonb_build_object(
        'ok', true,
        'idempotente', true,
        'tarea', public._watch_tarea_json(v_tarea.id)
      );
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'terminal', 'estado', v_tarea.estado);
  end if;

  update public.tareas_programadas
  set estado = p_estado,
      pospuesta_hasta = case
        when p_estado = 'pospuesta' then pg_catalog.now() + pg_catalog.make_interval(mins => p_posponer_minutos)
        else null
      end,
      hecha_por = case when p_estado in ('hecha', 'omitida') then p_user_id else null end,
      dispositivo_id = p_device_id
  where id = v_tarea.id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'idempotente', false,
    'tarea', public._watch_tarea_json(v_tarea.id)
  );
end;
$$;

-- Paseo del reloj con sus mascotas y los incidentes ocurridos durante él, en
-- una sola transacción. p_id viene del reloj: si ya existe, responde OK sin
-- duplicar. Todas las mascotas deben ser de UN hogar del usuario.
-- p_ruta: [{"lat": 29.07, "lng": -110.95, "ts": 1731050000000}, ...] o null.
-- p_incidentes: [{"id", "mascota_id", "tipo", "ocurrido_en", "lat", "lng", "nota"}, ...].
create function public.watch_registrar_paseo(
  p_user_id uuid,
  p_device_id uuid,
  p_id uuid,
  p_mascota_ids uuid[],
  p_iniciado_en timestamptz,
  p_terminado_en timestamptz,
  p_duracion_seg integer,
  p_distancia_m numeric,
  p_pasos integer,
  p_ruta jsonb,
  p_incidentes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existente public.paseos%rowtype;
  v_mascotas uuid[];
  v_hogares uuid[];
  v_validas integer;
  v_insertado integer;
  v_incidentes_insertados integer := 0;
begin
  if p_user_id is null
    or p_device_id is null
    or p_id is null
    or p_iniciado_en is null
    or p_terminado_en is null
    or p_terminado_en < p_iniciado_en
    or p_duracion_seg is null
    or p_duracion_seg not between 0 and 86400 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  select pg_catalog.array_agg(distinct u.mascota_id)
  into v_mascotas
  from unnest(p_mascota_ids) as u(mascota_id)
  where u.mascota_id is not null;

  if v_mascotas is null or cardinality(v_mascotas) = 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  -- Serializa reintentos simultáneos del mismo paseo.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('watch_paseo:' || p_id::text));

  select * into v_existente from public.paseos where id = p_id;
  if found then
    if exists (
      select 1
      from public.hogar_miembros as hm
      where hm.hogar_id = v_existente.hogar_id
        and hm.usuario_id = p_user_id
    ) then
      return pg_catalog.jsonb_build_object(
        'ok', true,
        'idempotente', true,
        'paseo_id', p_id,
        'incidentes_insertados', 0
      );
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'id_conflict');
  end if;

  -- Las mascotas deben existir, ser de hogares del usuario y de un solo hogar.
  select pg_catalog.array_agg(distinct m.hogar_id), count(*)
  into v_hogares, v_validas
  from public.mascotas as m
  where m.id = any (v_mascotas)
    and exists (
      select 1
      from public.hogar_miembros as hm
      where hm.hogar_id = m.hogar_id
        and hm.usuario_id = p_user_id
    );

  if v_validas <> cardinality(v_mascotas) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'pet_not_found');
  end if;
  if cardinality(v_hogares) <> 1 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'mixed_households');
  end if;

  -- Los incidentes del paseo deben ser de mascotas del paseo. Se valida antes
  -- de insertar nada.
  if p_incidentes is not null then
    if pg_catalog.jsonb_typeof(p_incidentes) <> 'array' then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_input');
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_incidentes) as e(valor)
      where not coalesce((e.valor ->> 'mascota_id')::uuid = any (v_mascotas), false)
    ) then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'incident_pet_not_in_walk');
    end if;
  end if;

  insert into public.paseos (
    id, hogar_id, iniciado_en, terminado_en, duracion_seg, distancia_m, pasos, ruta,
    origen, dispositivo_id, registrado_por
  )
  values (
    p_id,
    v_hogares[1],
    p_iniciado_en,
    p_terminado_en,
    p_duracion_seg,
    round(p_distancia_m, 1),
    p_pasos,
    p_ruta,
    'reloj',
    p_device_id,
    p_user_id
  )
  on conflict (id) do nothing;

  get diagnostics v_insertado = row_count;
  if v_insertado = 0 then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'idempotente', true,
      'paseo_id', p_id,
      'incidentes_insertados', 0
    );
  end if;

  insert into public.paseo_mascotas (paseo_id, mascota_id)
  select p_id, u.mascota_id
  from unnest(v_mascotas) as u(mascota_id)
  on conflict (paseo_id, mascota_id) do nothing;

  if p_incidentes is not null then
    insert into public.incidentes (
      id, mascota_id, tipo, ocurrido_en, lat, lng, paseo_id, nota,
      origen, dispositivo_id, registrado_por
    )
    select
      (e.valor ->> 'id')::uuid,
      (e.valor ->> 'mascota_id')::uuid,
      e.valor ->> 'tipo',
      (e.valor ->> 'ocurrido_en')::timestamptz,
      (e.valor ->> 'lat')::double precision,
      (e.valor ->> 'lng')::double precision,
      p_id,
      nullif(btrim(coalesce(e.valor ->> 'nota', '')), ''),
      'reloj',
      p_device_id,
      p_user_id
    from pg_catalog.jsonb_array_elements(p_incidentes) as e(valor)
    on conflict (id) do nothing;

    get diagnostics v_incidentes_insertados = row_count;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'idempotente', false,
    'paseo_id', p_id,
    'incidentes_insertados', v_incidentes_insertados
  );
end;
$$;

-- Incidentes fuera de un paseo. Los ids que ya existen se ignoran; los de
-- mascotas que no son de hogares del usuario se rechazan (no se reintentan).
create function public.watch_registrar_incidentes(
  p_user_id uuid,
  p_device_id uuid,
  p_incidentes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incidente jsonb;
  v_id uuid;
  v_mascota_id uuid;
  v_insertados uuid[] := '{}';
  v_existentes uuid[] := '{}';
  v_rechazados jsonb := '[]'::jsonb;
begin
  if p_user_id is null
    or p_device_id is null
    or p_incidentes is null
    or pg_catalog.jsonb_typeof(p_incidentes) <> 'array' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  for v_incidente in select e.valor from pg_catalog.jsonb_array_elements(p_incidentes) as e(valor) loop
    v_id := (v_incidente ->> 'id')::uuid;
    v_mascota_id := (v_incidente ->> 'mascota_id')::uuid;

    if exists (select 1 from public.incidentes where id = v_id) then
      v_existentes := array_append(v_existentes, v_id);
      continue;
    end if;

    if not exists (
      select 1
      from public.mascotas as m
      join public.hogar_miembros as hm on hm.hogar_id = m.hogar_id
      where m.id = v_mascota_id
        and hm.usuario_id = p_user_id
    ) then
      v_rechazados := v_rechazados || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('id', v_id, 'motivo', 'mascota_no_encontrada')
      );
      continue;
    end if;

    insert into public.incidentes (
      id, mascota_id, tipo, ocurrido_en, lat, lng, nota,
      origen, dispositivo_id, registrado_por
    )
    values (
      v_id,
      v_mascota_id,
      v_incidente ->> 'tipo',
      (v_incidente ->> 'ocurrido_en')::timestamptz,
      (v_incidente ->> 'lat')::double precision,
      (v_incidente ->> 'lng')::double precision,
      nullif(btrim(coalesce(v_incidente ->> 'nota', '')), ''),
      'reloj',
      p_device_id,
      p_user_id
    )
    on conflict (id) do nothing;

    if found then
      v_insertados := array_append(v_insertados, v_id);
    else
      v_existentes := array_append(v_existentes, v_id);
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'insertados', pg_catalog.to_jsonb(v_insertados),
    'existentes', pg_catalog.to_jsonb(v_existentes),
    'rechazados', v_rechazados
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Privilegios: nadie ejecuta estas funciones salvo service_role
-- -----------------------------------------------------------------------------
revoke all on function
  public.watch_set_updated_at(),
  public.tareas_limpiar_dispositivo(),
  public.tareas_limpiar_referencias_borradas(),
  public.watch_start_pairing(uuid, text, text, text, text, text),
  public.watch_consume_rate_limit(text, integer, integer),
  public.watch_pair_preview(uuid, text),
  public.watch_pair_approve(uuid, text, uuid),
  public.watch_pair_claim_token(uuid, text, text, timestamptz),
  public.watch_authenticate_device(text),
  public.watch_revoke_device(uuid, uuid),
  public._watch_iso(timestamptz),
  public._watch_generar_tareas_usuario(uuid, integer),
  public._watch_tarea_json(uuid),
  public.watch_listar_mascotas(uuid),
  public.watch_listar_tareas(uuid, timestamptz, timestamptz, integer),
  public.watch_actualizar_tarea(uuid, uuid, uuid, text, integer),
  public.watch_registrar_paseo(uuid, uuid, uuid, uuid[], timestamptz, timestamptz, integer, numeric, integer, jsonb, jsonb),
  public.watch_registrar_incidentes(uuid, uuid, jsonb)
from public, anon, authenticated;

grant execute on function
  public.watch_start_pairing(uuid, text, text, text, text, text),
  public.watch_consume_rate_limit(text, integer, integer),
  public.watch_pair_preview(uuid, text),
  public.watch_pair_approve(uuid, text, uuid),
  public.watch_pair_claim_token(uuid, text, text, timestamptz),
  public.watch_authenticate_device(text),
  public.watch_revoke_device(uuid, uuid),
  public._watch_iso(timestamptz),
  public._watch_generar_tareas_usuario(uuid, integer),
  public._watch_tarea_json(uuid),
  public.watch_listar_mascotas(uuid),
  public.watch_listar_tareas(uuid, timestamptz, timestamptz, integer),
  public.watch_actualizar_tarea(uuid, uuid, uuid, text, integer),
  public.watch_registrar_paseo(uuid, uuid, uuid, uuid[], timestamptz, timestamptz, integer, numeric, integer, jsonb, jsonb),
  public.watch_registrar_incidentes(uuid, uuid, jsonb)
to service_role;

commit;

-- Pide a PostgREST que recargue el esquema para exponer las funciones nuevas.
notify pgrst, 'reload schema';
