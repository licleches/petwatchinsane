-- =====================================================================
-- PetWatch - Esquema inicial
-- Ejecutar completo en Supabase > SQL Editor (o con `supabase db push`).
-- Incluye: tablas, RLS, funciones (RPC), triggers, Realtime y Storage.
-- Las tablas watch_* y las Edge Functions del reloj van en una fase posterior.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Utilidades
-- ---------------------------------------------------------------------
create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Perfiles, hogares y miembros
-- ---------------------------------------------------------------------
create table public.perfiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  nombre          text not null check (char_length(trim(nombre)) between 1 and 80),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create table public.hogares (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null check (char_length(trim(nombre)) between 1 and 80),
  -- Zona horaria usada para generar las tareas del hogar. Cámbiala si es necesario.
  zona_horaria       text not null default 'America/Hermosillo',
  codigo_invitacion  text not null unique
                     default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  creado_por         uuid not null references public.perfiles (id) on delete restrict,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);

create table public.hogar_miembros (
  hogar_id    uuid not null references public.hogares (id) on delete cascade,
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  rol         text not null default 'miembro' check (rol in ('propietario', 'miembro')),
  unido_en    timestamptz not null default now(),
  primary key (hogar_id, usuario_id)
);
create index hogar_miembros_usuario_idx on public.hogar_miembros (usuario_id);

-- ---------------------------------------------------------------------
-- 2. Mascotas y cuidados
-- ---------------------------------------------------------------------
create table public.mascotas (
  id                  uuid primary key default gen_random_uuid(),
  hogar_id            uuid not null references public.hogares (id) on delete cascade,
  nombre              text not null check (char_length(trim(nombre)) between 1 and 60),
  especie             text not null default 'perro'
                      check (especie in ('perro', 'gato', 'ave', 'conejo', 'roedor', 'reptil', 'pez', 'otro')),
  raza                text check (raza is null or char_length(raza) <= 60),
  sexo                text not null default 'desconocido' check (sexo in ('macho', 'hembra', 'desconocido')),
  fecha_nacimiento    date check (fecha_nacimiento is null or fecha_nacimiento <= current_date),
  peso_kg             numeric(6, 2) check (peso_kg is null or peso_kg > 0),
  -- Ruta del archivo en el bucket "mascotas": <hogar_id>/<archivo>
  foto_path           text,
  meta_paseo_min_dia  integer not null default 30 check (meta_paseo_min_dia between 0 and 600),
  notas               text check (notas is null or char_length(notas) <= 1000),
  activa              boolean not null default true,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
create index mascotas_hogar_idx on public.mascotas (hogar_id);

create table public.cuidados (
  id              uuid primary key default gen_random_uuid(),
  mascota_id      uuid not null references public.mascotas (id) on delete cascade,
  tipo            text not null check (tipo in ('comida', 'medicamento', 'paseo', 'otro')),
  nombre          text not null check (char_length(trim(nombre)) between 1 and 80),
  detalle         text check (detalle is null or char_length(detalle) <= 500),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index cuidados_mascota_idx on public.cuidados (mascota_id);

create table public.horarios_cuidado (
  id              uuid primary key default gen_random_uuid(),
  cuidado_id      uuid not null references public.cuidados (id) on delete cascade,
  hora            time not null,
  -- 0 = domingo ... 6 = sábado
  dias_semana     smallint[] not null default array[0, 1, 2, 3, 4, 5, 6]::smallint[]
                  check (cardinality(dias_semana) between 1 and 7
                         and dias_semana <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index horarios_cuidado_cuidado_idx on public.horarios_cuidado (cuidado_id);

create table public.tareas_programadas (
  id               uuid primary key default gen_random_uuid(),
  horario_id       uuid not null references public.horarios_cuidado (id) on delete cascade,
  programada_para  timestamptz not null,
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente', 'hecha', 'pospuesta', 'omitida')),
  hecha_por        uuid references public.perfiles (id) on delete set null,
  hecha_en         timestamptz,
  pospuesta_hasta  timestamptz,
  -- Para cuando el reloj confirme la tarea (fase 2)
  dispositivo_id   uuid,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  unique (horario_id, programada_para),
  check (estado <> 'pospuesta' or pospuesta_hasta is not null)
);
create index tareas_programadas_fecha_idx on public.tareas_programadas (programada_para);

-- ---------------------------------------------------------------------
-- 3. Expediente: vacunas y visitas al veterinario
-- ---------------------------------------------------------------------
create table public.vacunas (
  id              uuid primary key default gen_random_uuid(),
  mascota_id      uuid not null references public.mascotas (id) on delete cascade,
  nombre          text not null check (char_length(trim(nombre)) between 1 and 80),
  aplicada_en     date not null,
  proxima_en      date,
  veterinario     text check (veterinario is null or char_length(veterinario) <= 80),
  lote            text check (lote is null or char_length(lote) <= 40),
  notas           text check (notas is null or char_length(notas) <= 500),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  check (proxima_en is null or proxima_en >= aplicada_en)
);
create index vacunas_mascota_idx on public.vacunas (mascota_id);
create index vacunas_proxima_idx on public.vacunas (proxima_en);

create table public.visitas_veterinario (
  id              uuid primary key default gen_random_uuid(),
  mascota_id      uuid not null references public.mascotas (id) on delete cascade,
  fecha           timestamptz not null,
  clinica         text check (clinica is null or char_length(clinica) <= 80),
  veterinario     text check (veterinario is null or char_length(veterinario) <= 80),
  motivo          text not null check (char_length(trim(motivo)) between 1 and 200),
  diagnostico     text check (diagnostico is null or char_length(diagnostico) <= 1000),
  tratamiento     text check (tratamiento is null or char_length(tratamiento) <= 1000),
  costo           numeric(10, 2) check (costo is null or costo >= 0),
  notas           text check (notas is null or char_length(notas) <= 1000),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index visitas_veterinario_mascota_idx on public.visitas_veterinario (mascota_id, fecha desc);

-- ---------------------------------------------------------------------
-- 4. Paseos e incidentes (datos que también generará el reloj)
-- ---------------------------------------------------------------------
create table public.paseos (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares (id) on delete cascade,
  iniciado_en     timestamptz not null,
  terminado_en    timestamptz not null,
  duracion_seg    integer not null check (duracion_seg between 0 and 86400),
  distancia_m     numeric(10, 1) check (distancia_m is null or distancia_m >= 0),
  pasos           integer check (pasos is null or pasos >= 0),
  -- Arreglo de puntos: [{"lat": 0, "lng": 0, "t": "ISO-8601"}, ...]
  ruta            jsonb check (ruta is null or jsonb_typeof(ruta) = 'array'),
  origen          text not null default 'app' check (origen in ('reloj', 'app')),
  dispositivo_id  uuid,
  registrado_por  uuid default auth.uid() references public.perfiles (id) on delete set null,
  nota            text check (nota is null or char_length(nota) <= 500),
  creado_en       timestamptz not null default now(),
  check (terminado_en >= iniciado_en)
);
create index paseos_hogar_idx on public.paseos (hogar_id, iniciado_en desc);

create table public.paseo_mascotas (
  paseo_id    uuid not null references public.paseos (id) on delete cascade,
  mascota_id  uuid not null references public.mascotas (id) on delete cascade,
  primary key (paseo_id, mascota_id)
);
create index paseo_mascotas_mascota_idx on public.paseo_mascotas (mascota_id);

create table public.incidentes (
  -- El reloj puede generar el id para que un reintento no duplique el registro.
  id              uuid primary key default gen_random_uuid(),
  mascota_id      uuid not null references public.mascotas (id) on delete cascade,
  tipo            text not null
                  check (tipo in ('vomito', 'no_comio', 'cojea', 'diarrea', 'pelea', 'otro')),
  ocurrido_en     timestamptz not null default now(),
  lat             double precision check (lat is null or lat between -90 and 90),
  lng             double precision check (lng is null or lng between -180 and 180),
  paseo_id        uuid references public.paseos (id) on delete set null,
  nota            text check (nota is null or char_length(nota) <= 500),
  origen          text not null default 'app' check (origen in ('reloj', 'app')),
  dispositivo_id  uuid,
  registrado_por  uuid default auth.uid() references public.perfiles (id) on delete set null,
  creado_en       timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index incidentes_mascota_idx on public.incidentes (mascota_id, ocurrido_en desc);
create index incidentes_paseo_idx on public.incidentes (paseo_id);

-- ---------------------------------------------------------------------
-- 5. Triggers de actualizado_en
-- ---------------------------------------------------------------------
create trigger perfiles_actualizado before update on public.perfiles
  for each row execute function public.tocar_actualizado_en();
create trigger hogares_actualizado before update on public.hogares
  for each row execute function public.tocar_actualizado_en();
create trigger mascotas_actualizado before update on public.mascotas
  for each row execute function public.tocar_actualizado_en();
create trigger cuidados_actualizado before update on public.cuidados
  for each row execute function public.tocar_actualizado_en();
create trigger horarios_cuidado_actualizado before update on public.horarios_cuidado
  for each row execute function public.tocar_actualizado_en();
create trigger tareas_programadas_actualizado before update on public.tareas_programadas
  for each row execute function public.tocar_actualizado_en();
create trigger vacunas_actualizado before update on public.vacunas
  for each row execute function public.tocar_actualizado_en();
create trigger visitas_veterinario_actualizado before update on public.visitas_veterinario
  for each row execute function public.tocar_actualizado_en();

-- Al cambiar el estado de una tarea, registra quién y cuándo.
create or replace function public.registrar_estado_tarea()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado = 'hecha' then
      new.hecha_en := coalesce(new.hecha_en, now());
      new.hecha_por := coalesce(auth.uid(), new.hecha_por);
      new.pospuesta_hasta := null;
    elsif new.estado = 'omitida' then
      new.hecha_por := coalesce(auth.uid(), new.hecha_por);
      new.hecha_en := null;
      new.pospuesta_hasta := null;
    elsif new.estado = 'pospuesta' then
      new.hecha_por := coalesce(auth.uid(), new.hecha_por);
      new.hecha_en := null;
    elsif new.estado = 'pendiente' then
      new.hecha_por := null;
      new.hecha_en := null;
      new.pospuesta_hasta := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger tareas_programadas_estado before update on public.tareas_programadas
  for each row execute function public.registrar_estado_tarea();

-- ---------------------------------------------------------------------
-- 6. Funciones de acceso (usadas por RLS). SECURITY DEFINER evita
--    recursión de políticas y mantiene las consultas rápidas.
-- ---------------------------------------------------------------------
create or replace function public.es_miembro_hogar(p_hogar_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hogar_miembros
    where hogar_id = p_hogar_id and usuario_id = auth.uid()
  );
$$;

create or replace function public.es_propietario_hogar(p_hogar_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hogar_miembros
    where hogar_id = p_hogar_id and usuario_id = auth.uid() and rol = 'propietario'
  );
$$;

create or replace function public.comparte_hogar(p_usuario_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hogar_miembros yo
    join public.hogar_miembros otro on otro.hogar_id = yo.hogar_id
    where yo.usuario_id = auth.uid() and otro.usuario_id = p_usuario_id
  );
$$;

create or replace function public.puede_acceder_mascota(p_mascota_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.mascotas m
    join public.hogar_miembros hm on hm.hogar_id = m.hogar_id
    where m.id = p_mascota_id and hm.usuario_id = auth.uid()
  );
$$;

create or replace function public.puede_acceder_cuidado(p_cuidado_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cuidados c
    join public.mascotas m on m.id = c.mascota_id
    join public.hogar_miembros hm on hm.hogar_id = m.hogar_id
    where c.id = p_cuidado_id and hm.usuario_id = auth.uid()
  );
$$;

create or replace function public.puede_acceder_horario(p_horario_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.horarios_cuidado h
    join public.cuidados c on c.id = h.cuidado_id
    join public.mascotas m on m.id = c.mascota_id
    join public.hogar_miembros hm on hm.hogar_id = m.hogar_id
    where h.id = p_horario_id and hm.usuario_id = auth.uid()
  );
$$;

create or replace function public.puede_acceder_paseo(p_paseo_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.paseos p
    join public.hogar_miembros hm on hm.hogar_id = p.hogar_id
    where p.id = p_paseo_id and hm.usuario_id = auth.uid()
  );
$$;

-- Para Storage: la primera carpeta del archivo es el hogar_id.
create or replace function public.es_miembro_hogar_texto(p_hogar_id text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when p_hogar_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.es_miembro_hogar(p_hogar_id::uuid)
    else false
  end;
$$;

-- ---------------------------------------------------------------------
-- 7. RPC para la app
-- ---------------------------------------------------------------------

-- Crea un hogar adicional y agrega al usuario como propietario.
create or replace function public.crear_hogar(p_nombre text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_hogar_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  insert into public.hogares (nombre, creado_por)
  values (trim(p_nombre), auth.uid())
  returning id into v_hogar_id;
  insert into public.hogar_miembros (hogar_id, usuario_id, rol)
  values (v_hogar_id, auth.uid(), 'propietario');
  return v_hogar_id;
end;
$$;

-- Unirse a un hogar con su código de invitación (8 caracteres).
create or replace function public.unirse_hogar(p_codigo text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_hogar_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  select id into v_hogar_id
  from public.hogares
  where codigo_invitacion = upper(trim(p_codigo));
  if v_hogar_id is null then
    raise exception 'Código de invitación no válido' using errcode = 'P0002';
  end if;
  insert into public.hogar_miembros (hogar_id, usuario_id, rol)
  values (v_hogar_id, auth.uid(), 'miembro')
  on conflict (hogar_id, usuario_id) do nothing;
  return v_hogar_id;
end;
$$;

-- Genera un código de invitación nuevo (solo propietarios).
create or replace function public.regenerar_codigo_hogar(p_hogar_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_codigo text;
begin
  if not public.es_propietario_hogar(p_hogar_id) then
    raise exception 'Solo el propietario puede cambiar el código' using errcode = '42501';
  end if;
  update public.hogares
  set codigo_invitacion = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  where id = p_hogar_id
  returning codigo_invitacion into v_codigo;
  return v_codigo;
end;
$$;

-- Genera las tareas de los próximos días a partir de los horarios activos
-- y elimina las tareas pendientes futuras que ya no coinciden con un horario.
-- Llamar después de crear/editar mascotas, cuidados u horarios, y al abrir la app.
create or replace function public.generar_tareas(p_hogar_id uuid, p_dias integer default 14)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tz     text;
  v_nuevas integer;
begin
  if not public.es_miembro_hogar(p_hogar_id) then
    raise exception 'No perteneces a este hogar' using errcode = '42501';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 31 then
    raise exception 'p_dias debe estar entre 1 y 31' using errcode = '22023';
  end if;

  select zona_horaria into v_tz from public.hogares where id = p_hogar_id;

  delete from public.tareas_programadas t
  using public.horarios_cuidado h, public.cuidados c, public.mascotas m
  where t.horario_id = h.id
    and h.cuidado_id = c.id
    and c.mascota_id = m.id
    and m.hogar_id = p_hogar_id
    and t.estado = 'pendiente'
    and t.programada_para > now()
    and (
      not h.activo or not c.activo or not m.activa
      or (t.programada_para at time zone v_tz)::time <> h.hora
      or not (extract(dow from (t.programada_para at time zone v_tz))::smallint = any (h.dias_semana))
    );

  insert into public.tareas_programadas (horario_id, programada_para)
  select h.id, (d.fecha + h.hora) at time zone v_tz
  from public.horarios_cuidado h
  join public.cuidados c on c.id = h.cuidado_id
  join public.mascotas m on m.id = c.mascota_id
  cross join lateral (
    select (now() at time zone v_tz)::date + g as fecha
    from generate_series(0, p_dias - 1) as g
  ) d
  where m.hogar_id = p_hogar_id
    and h.activo and c.activo and m.activa
    and extract(dow from d.fecha)::smallint = any (h.dias_semana)
    and ((d.fecha + h.hora) at time zone v_tz) > now()
  on conflict (horario_id, programada_para) do nothing;

  get diagnostics v_nuevas = row_count;
  return v_nuevas;
end;
$$;

-- Registra un paseo con sus mascotas en una sola llamada.
create or replace function public.registrar_paseo(
  p_hogar_id      uuid,
  p_mascota_ids   uuid[],
  p_iniciado_en   timestamptz,
  p_terminado_en  timestamptz,
  p_distancia_m   numeric default null,
  p_pasos         integer default null,
  p_ruta          jsonb default null,
  p_nota          text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_paseo_id uuid;
  v_validas  integer;
begin
  if not public.es_miembro_hogar(p_hogar_id) then
    raise exception 'No perteneces a este hogar' using errcode = '42501';
  end if;
  if p_mascota_ids is null or cardinality(p_mascota_ids) = 0 then
    raise exception 'Selecciona al menos una mascota' using errcode = '22023';
  end if;
  select count(*) into v_validas
  from public.mascotas
  where id = any (p_mascota_ids) and hogar_id = p_hogar_id;
  if v_validas <> cardinality(array(select distinct unnest(p_mascota_ids))) then
    raise exception 'Alguna mascota no pertenece al hogar' using errcode = '22023';
  end if;

  insert into public.paseos (
    hogar_id, iniciado_en, terminado_en, duracion_seg, distancia_m, pasos, ruta,
    origen, registrado_por, nota
  ) values (
    p_hogar_id, p_iniciado_en, p_terminado_en,
    greatest(0, extract(epoch from (p_terminado_en - p_iniciado_en)))::integer,
    p_distancia_m, p_pasos, p_ruta, 'app', auth.uid(), p_nota
  )
  returning id into v_paseo_id;

  insert into public.paseo_mascotas (paseo_id, mascota_id)
  select distinct v_paseo_id, unnest(p_mascota_ids);

  return v_paseo_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Alta de usuario: crea perfil + hogar propio automáticamente.
--    En el registro manda options.data.nombre en supabase.auth.signUp().
-- ---------------------------------------------------------------------
create or replace function public.manejar_nuevo_usuario()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nombre   text;
  v_hogar_id uuid;
begin
  v_nombre := left(coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuario'
  ), 80);

  insert into public.perfiles (id, nombre) values (new.id, v_nombre);

  insert into public.hogares (nombre, creado_por)
  values (left('Hogar de ' || v_nombre, 80), new.id)
  returning id into v_hogar_id;

  insert into public.hogar_miembros (hogar_id, usuario_id, rol)
  values (v_hogar_id, new.id, 'propietario');

  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.manejar_nuevo_usuario();

-- ---------------------------------------------------------------------
-- 9. Row Level Security
-- ---------------------------------------------------------------------
alter table public.perfiles             enable row level security;
alter table public.hogares              enable row level security;
alter table public.hogar_miembros       enable row level security;
alter table public.mascotas             enable row level security;
alter table public.cuidados             enable row level security;
alter table public.horarios_cuidado     enable row level security;
alter table public.tareas_programadas   enable row level security;
alter table public.vacunas              enable row level security;
alter table public.visitas_veterinario  enable row level security;
alter table public.paseos               enable row level security;
alter table public.paseo_mascotas       enable row level security;
alter table public.incidentes           enable row level security;

-- perfiles
create policy perfiles_select on public.perfiles for select to authenticated
  using (id = auth.uid() or public.comparte_hogar(id));
create policy perfiles_update on public.perfiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- hogares (crear/unirse se hace por RPC)
create policy hogares_select on public.hogares for select to authenticated
  using (public.es_miembro_hogar(id));
create policy hogares_update on public.hogares for update to authenticated
  using (public.es_propietario_hogar(id)) with check (public.es_propietario_hogar(id));
create policy hogares_delete on public.hogares for delete to authenticated
  using (public.es_propietario_hogar(id));

-- hogar_miembros (altas por RPC; salir o expulsar con delete)
create policy hogar_miembros_select on public.hogar_miembros for select to authenticated
  using (public.es_miembro_hogar(hogar_id));
create policy hogar_miembros_delete on public.hogar_miembros for delete to authenticated
  using (usuario_id = auth.uid() or public.es_propietario_hogar(hogar_id));

-- mascotas
create policy mascotas_select on public.mascotas for select to authenticated
  using (public.es_miembro_hogar(hogar_id));
create policy mascotas_insert on public.mascotas for insert to authenticated
  with check (public.es_miembro_hogar(hogar_id));
create policy mascotas_update on public.mascotas for update to authenticated
  using (public.es_miembro_hogar(hogar_id)) with check (public.es_miembro_hogar(hogar_id));
create policy mascotas_delete on public.mascotas for delete to authenticated
  using (public.es_miembro_hogar(hogar_id));

-- cuidados
create policy cuidados_all on public.cuidados for all to authenticated
  using (public.puede_acceder_mascota(mascota_id))
  with check (public.puede_acceder_mascota(mascota_id));

-- horarios_cuidado
create policy horarios_cuidado_all on public.horarios_cuidado for all to authenticated
  using (public.puede_acceder_cuidado(cuidado_id))
  with check (public.puede_acceder_cuidado(cuidado_id));

-- tareas_programadas (se crean con generar_tareas; la app solo lee y actualiza)
create policy tareas_programadas_select on public.tareas_programadas for select to authenticated
  using (public.puede_acceder_horario(horario_id));
create policy tareas_programadas_update on public.tareas_programadas for update to authenticated
  using (public.puede_acceder_horario(horario_id))
  with check (public.puede_acceder_horario(horario_id));

-- vacunas
create policy vacunas_all on public.vacunas for all to authenticated
  using (public.puede_acceder_mascota(mascota_id))
  with check (public.puede_acceder_mascota(mascota_id));

-- visitas_veterinario
create policy visitas_veterinario_all on public.visitas_veterinario for all to authenticated
  using (public.puede_acceder_mascota(mascota_id))
  with check (public.puede_acceder_mascota(mascota_id));

-- paseos
create policy paseos_select on public.paseos for select to authenticated
  using (public.es_miembro_hogar(hogar_id));
create policy paseos_insert on public.paseos for insert to authenticated
  with check (public.es_miembro_hogar(hogar_id) and registrado_por = auth.uid());
create policy paseos_update on public.paseos for update to authenticated
  using (public.es_miembro_hogar(hogar_id)) with check (public.es_miembro_hogar(hogar_id));
create policy paseos_delete on public.paseos for delete to authenticated
  using (public.es_miembro_hogar(hogar_id));

-- paseo_mascotas (la mascota debe ser del mismo hogar que el paseo)
create policy paseo_mascotas_select on public.paseo_mascotas for select to authenticated
  using (public.puede_acceder_paseo(paseo_id));
create policy paseo_mascotas_insert on public.paseo_mascotas for insert to authenticated
  with check (
    public.puede_acceder_paseo(paseo_id)
    and exists (
      select 1 from public.paseos p
      join public.mascotas m on m.hogar_id = p.hogar_id
      where p.id = paseo_id and m.id = mascota_id
    )
  );
create policy paseo_mascotas_delete on public.paseo_mascotas for delete to authenticated
  using (public.puede_acceder_paseo(paseo_id));

-- incidentes
create policy incidentes_select on public.incidentes for select to authenticated
  using (public.puede_acceder_mascota(mascota_id));
create policy incidentes_insert on public.incidentes for insert to authenticated
  with check (public.puede_acceder_mascota(mascota_id) and registrado_por = auth.uid());
create policy incidentes_update on public.incidentes for update to authenticated
  using (public.puede_acceder_mascota(mascota_id))
  with check (public.puede_acceder_mascota(mascota_id));
create policy incidentes_delete on public.incidentes for delete to authenticated
  using (public.puede_acceder_mascota(mascota_id));

-- Las funciones RPC solo para usuarios con sesión.
revoke execute on function public.crear_hogar(text) from public, anon;
revoke execute on function public.unirse_hogar(text) from public, anon;
revoke execute on function public.regenerar_codigo_hogar(uuid) from public, anon;
revoke execute on function public.generar_tareas(uuid, integer) from public, anon;
revoke execute on function public.registrar_paseo(uuid, uuid[], timestamptz, timestamptz, numeric, integer, jsonb, text) from public, anon;
grant execute on function public.crear_hogar(text) to authenticated;
grant execute on function public.unirse_hogar(text) to authenticated;
grant execute on function public.regenerar_codigo_hogar(uuid) to authenticated;
grant execute on function public.generar_tareas(uuid, integer) to authenticated;
grant execute on function public.registrar_paseo(uuid, uuid[], timestamptz, timestamptz, numeric, integer, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------
-- 10. Realtime
-- ---------------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['tareas_programadas', 'incidentes', 'paseos', 'mascotas'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabla
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabla);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 11. Storage: fotos de mascotas (bucket privado, ruta <hogar_id>/<archivo>)
--     En la app usa createSignedUrl() para mostrar la foto.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mascotas', 'mascotas', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy fotos_mascotas_select on storage.objects for select to authenticated
  using (bucket_id = 'mascotas' and public.es_miembro_hogar_texto((storage.foldername(name))[1]));
create policy fotos_mascotas_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'mascotas' and public.es_miembro_hogar_texto((storage.foldername(name))[1]));
create policy fotos_mascotas_update on storage.objects for update to authenticated
  using (bucket_id = 'mascotas' and public.es_miembro_hogar_texto((storage.foldername(name))[1]))
  with check (bucket_id = 'mascotas' and public.es_miembro_hogar_texto((storage.foldername(name))[1]));
create policy fotos_mascotas_delete on storage.objects for delete to authenticated
  using (bucket_id = 'mascotas' and public.es_miembro_hogar_texto((storage.foldername(name))[1]));