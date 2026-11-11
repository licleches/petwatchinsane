-- =============================================================================
-- PetWatch · Ajustes al esquema inicial
-- =============================================================================
-- En Supabase está aplicada la versión ORIGINAL de 20261108120000_petwatch_inicial.sql.
-- Esta migración lleva esa base al esquema que usa la app (hogares con zona horaria
-- y códigos que vencen, roles 'dueño'/'miembro', tareas con hogar y mascota,
-- reglas de estado, guardar_cuidado, permisos por columna, bucket fotos-mascotas...).
--
-- IMPORTANTE: los datos de PetWatch (tablas public.*) son de prueba y SE BORRAN.
--   * auth.users no se toca: al final se recrean perfil y hogar de cada usuario.
--   * El bucket 'mascotas' y sus archivos se conservan (quedan sin uso); las fotos
--     nuevas van al bucket privado 'fotos-mascotas'.
--
-- Seguridad: corre en una transacción y solo si detecta el esquema ORIGINAL (o una
-- base vacía). Si el esquema ya está actualizado, se detiene sin cambiar nada.
-- Usa drop ... if exists, create or replace e if not exists.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- A. Candado: solo sobre el esquema ORIGINAL (o sin tablas de PetWatch)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.hogar_miembros') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hogar_miembros' and column_name = 'id'
    ) then
    raise exception 'El esquema de PetWatch ya está actualizado; 20261108125000_ajustes no se aplica.';
  end if;
  if to_regclass('public.hogar_miembros') is not null
    and to_regprocedure('public.tocar_actualizado_en()') is null then
    raise exception 'No se reconoce el esquema actual de PetWatch. Revisa la base; no se aplicaron cambios.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- B. Quitar los objetos del esquema ORIGINAL
-- -----------------------------------------------------------------------------
drop policy if exists fotos_mascotas_select on storage.objects;
drop policy if exists fotos_mascotas_insert on storage.objects;
drop policy if exists fotos_mascotas_update on storage.objects;
drop policy if exists fotos_mascotas_delete on storage.objects;

drop trigger if exists al_crear_usuario on auth.users;

-- Al borrar las tablas también salen de la publicación supabase_realtime.
drop table if exists
  public.incidentes,
  public.paseo_mascotas,
  public.paseos,
  public.visitas_veterinario,
  public.vacunas,
  public.tareas_programadas,
  public.horarios_cuidado,
  public.cuidados,
  public.mascotas,
  public.hogar_miembros,
  public.hogares,
  public.perfiles
cascade;

drop function if exists public.tocar_actualizado_en() cascade;
drop function if exists public.registrar_estado_tarea() cascade;
drop function if exists public.es_miembro_hogar(uuid) cascade;
drop function if exists public.es_propietario_hogar(uuid) cascade;
drop function if exists public.comparte_hogar(uuid) cascade;
drop function if exists public.puede_acceder_mascota(uuid) cascade;
drop function if exists public.puede_acceder_cuidado(uuid) cascade;
drop function if exists public.puede_acceder_horario(uuid) cascade;
drop function if exists public.puede_acceder_paseo(uuid) cascade;
drop function if exists public.es_miembro_hogar_texto(text) cascade;
drop function if exists public.crear_hogar(text) cascade;
drop function if exists public.unirse_hogar(text) cascade;
drop function if exists public.regenerar_codigo_hogar(uuid) cascade;
drop function if exists public.generar_tareas(uuid, integer) cascade;
drop function if exists public.registrar_paseo(uuid, uuid[], timestamptz, timestamptz, numeric, integer, jsonb, text) cascade;
drop function if exists public.manejar_nuevo_usuario() cascade;

-- -----------------------------------------------------------------------------
-- C. Esquema actualizado (mismo contenido que usa la app)
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 0. Verificación previa: no se sobrescribe un esquema existente.
-- -----------------------------------------------------------------------------
do $$
declare
  existing_tables text;
begin
  select string_agg(table_name, ', ' order by table_name)
  into existing_tables
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'perfiles', 'hogares', 'hogar_miembros', 'mascotas', 'cuidados',
      'horarios_cuidado', 'tareas_programadas', 'vacunas', 'visitas_veterinario',
      'paseos', 'paseo_mascotas', 'incidentes'
    );

  if existing_tables is not null then
    raise exception 'Ya existen tablas de PetWatch: %. No se aplicaron cambios.', existing_tables;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Utilidades
-- -----------------------------------------------------------------------------
create or replace function public.establecer_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := pg_catalog.now();
  return new;
end;
$$;

create or replace function public.es_zona_horaria_valida(p_zona text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_zona is null or pg_catalog.length(p_zona) not between 1 and 64 then
    return false;
  end if;
  perform pg_catalog.timezone(p_zona, timestamptz '2000-01-01 00:00:00+00');
  return true;
exception
  when others then
    return false;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Tablas
-- -----------------------------------------------------------------------------
create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  zona_horaria text not null default 'America/Hermosillo'
    check (public.es_zona_horaria_valida(zona_horaria)),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
comment on table public.perfiles is 'Perfil de cada usuario; id = auth.users.id. Lo crea el trigger de registro.';

create table if not exists public.hogares (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  zona_horaria text not null default 'America/Hermosillo'
    check (public.es_zona_horaria_valida(zona_horaria)),
  codigo_invitacion text unique check (codigo_invitacion ~ '^[A-HJKMNP-Z2-9]{8}$'),
  codigo_expira_en timestamptz,
  creado_por uuid references public.perfiles (id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint hogares_codigo_completo check ((codigo_invitacion is null) = (codigo_expira_en is null))
);
comment on table public.hogares is 'Familia que comparte mascotas. Las tareas se generan con su zona horaria.';
comment on column public.hogares.codigo_invitacion is 'Código de 8 caracteres para unirse (generar_codigo_invitacion / unirse_hogar).';

create table if not exists public.hogar_miembros (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  rol text not null default 'miembro' check (rol in ('dueño', 'miembro')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint hogar_miembros_unico unique (hogar_id, usuario_id)
);
comment on column public.hogar_miembros.rol is '''dueño'' = quien creó el hogar. Todos los miembros tienen los mismos permisos.';

create table if not exists public.mascotas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 50),
  especie text not null
    check (especie in ('perro', 'gato', 'ave', 'conejo', 'roedor', 'reptil', 'pez', 'otro')),
  raza text check (raza is null or char_length(raza) <= 60),
  sexo text check (sexo is null or sexo in ('macho', 'hembra')),
  fecha_nacimiento date check (fecha_nacimiento is null or fecha_nacimiento >= date '1980-01-01'),
  peso_kg numeric(6, 2) check (peso_kg is null or (peso_kg > 0 and peso_kg <= 200)),
  foto_url text check (foto_url is null or char_length(foto_url) <= 300),
  meta_paseo_min_dia integer not null default 0 check (meta_paseo_min_dia between 0 and 600),
  notas text check (notas is null or char_length(notas) <= 500),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
comment on column public.mascotas.foto_url is 'Ruta del archivo en el bucket privado fotos-mascotas ({hogar_id}/{mascota_id}/...). La app genera URLs firmadas.';
comment on column public.mascotas.meta_paseo_min_dia is 'Minutos de paseo al día; 0 = sin meta.';

create table if not exists public.cuidados (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas (id) on delete cascade,
  tipo text not null check (tipo in ('comida', 'medicamento', 'paseo', 'otro')),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  detalle text check (detalle is null or char_length(detalle) <= 200),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.horarios_cuidado (
  id uuid primary key default gen_random_uuid(),
  cuidado_id uuid not null references public.cuidados (id) on delete cascade,
  hora time not null check (extract(second from hora) = 0),
  dias_semana smallint[] not null default '{0,1,2,3,4,5,6}'
    check (cardinality(dias_semana) between 1 and 7 and dias_semana <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
comment on column public.horarios_cuidado.dias_semana is '0 = domingo ... 6 = sábado.';
comment on column public.horarios_cuidado.activo is 'Al editar un cuidado, los horarios anteriores se desactivan para conservar el historial.';

create table if not exists public.tareas_programadas (
  id uuid primary key default gen_random_uuid(),
  horario_id uuid not null references public.horarios_cuidado (id) on delete cascade,
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  mascota_id uuid not null references public.mascotas (id) on delete cascade,
  programada_para timestamptz not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'hecha', 'pospuesta', 'omitida')),
  hecha_por uuid references public.perfiles (id) on delete set null,
  hecha_en timestamptz,
  pospuesta_hasta timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint tareas_programadas_unica unique (horario_id, programada_para),
  constraint tareas_pospuesta_con_hora check (estado <> 'pospuesta' or pospuesta_hasta is not null),
  constraint tareas_resuelta_con_fecha check ((estado in ('hecha', 'omitida')) = (hecha_en is not null))
);
comment on table public.tareas_programadas is 'Tareas de los próximos 14 días, generadas por generar_tareas() con la zona horaria del hogar.';
comment on column public.tareas_programadas.hogar_id is 'Copia de la mascota (la llena un trigger). Permite filtrar Realtime e historial por hogar.';
comment on column public.tareas_programadas.hecha_por is 'Quién resolvió la tarea (hecha u omitida). Lo asigna un trigger con auth.uid().';

create table if not exists public.vacunas (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  aplicada_en date not null,
  proxima_en date,
  veterinario text check (veterinario is null or char_length(veterinario) <= 80),
  notas text check (notas is null or char_length(notas) <= 500),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint vacunas_proxima_posterior check (proxima_en is null or proxima_en >= aplicada_en)
);

create table if not exists public.visitas_veterinario (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas (id) on delete cascade,
  fecha date not null,
  clinica text check (clinica is null or char_length(clinica) <= 80),
  motivo text not null check (char_length(btrim(motivo)) between 1 and 120),
  diagnostico text check (diagnostico is null or char_length(diagnostico) <= 500),
  tratamiento text check (tratamiento is null or char_length(tratamiento) <= 500),
  costo numeric(10, 2) check (costo is null or costo >= 0),
  notas text check (notas is null or char_length(notas) <= 500),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.paseos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  iniciado_en timestamptz not null,
  terminado_en timestamptz,
  duracion_seg integer not null default 0 check (duracion_seg between 0 and 86400),
  distancia_m numeric(10, 1) check (distancia_m is null or distancia_m between 0 and 1000000),
  pasos integer check (pasos is null or pasos between 0 and 1000000),
  ruta jsonb check (
    ruta is null
    or case when jsonb_typeof(ruta) = 'array' then jsonb_array_length(ruta) <= 20000 else false end
  ),
  puntos_ruta integer generated always as (
    case when jsonb_typeof(ruta) = 'array' then jsonb_array_length(ruta) else 0 end
  ) stored,
  origen text not null default 'app' check (origen in ('reloj', 'app')),
  dispositivo_id uuid,
  registrado_por uuid references public.perfiles (id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint paseos_fin_posterior check (terminado_en is null or terminado_en >= iniciado_en)
);
comment on column public.paseos.ruta is 'Arreglo de puntos [{"lat": 29.07, "lng": -110.95, "ts": 1731050000000}] (ts en ms, opcional). null = paseo manual.';
comment on column public.paseos.puntos_ruta is 'Número de puntos de la ruta (columna generada). Permite listar paseos sin descargar la ruta.';
comment on column public.paseos.dispositivo_id is 'Reloj que registró el paseo. Se enlazará con las tablas watch_* en la fase del reloj.';

create table if not exists public.paseo_mascotas (
  id uuid primary key default gen_random_uuid(),
  paseo_id uuid not null references public.paseos (id) on delete cascade,
  mascota_id uuid not null references public.mascotas (id) on delete cascade,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint paseo_mascotas_unica unique (paseo_id, mascota_id)
);

create table if not exists public.incidentes (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  mascota_id uuid not null references public.mascotas (id) on delete cascade,
  tipo text not null check (tipo in ('vomito', 'no_comio', 'cojea', 'diarrea', 'pelea', 'otro')),
  ocurrido_en timestamptz not null default now(),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  paseo_id uuid references public.paseos (id) on delete set null,
  nota text check (nota is null or char_length(nota) <= 500),
  origen text not null default 'app' check (origen in ('reloj', 'app')),
  dispositivo_id uuid,
  registrado_por uuid references public.perfiles (id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint incidentes_coordenadas_completas check ((lat is null) = (lng is null))
);
comment on column public.incidentes.id is 'Puede venir del cliente (app o reloj) para que un reintento no duplique el incidente.';
comment on column public.incidentes.hogar_id is 'Copia de la mascota (la llena un trigger). Permite filtrar Realtime por hogar.';

-- -----------------------------------------------------------------------------
-- 3. Índices
-- -----------------------------------------------------------------------------
create index if not exists hogar_miembros_usuario_idx on public.hogar_miembros (usuario_id);
create index if not exists hogares_creado_por_idx on public.hogares (creado_por);
create index if not exists mascotas_hogar_idx on public.mascotas (hogar_id, activa, nombre);
create index if not exists cuidados_mascota_idx on public.cuidados (mascota_id, activo);
create index if not exists horarios_cuidado_cuidado_idx on public.horarios_cuidado (cuidado_id, activo);
create unique index if not exists horarios_cuidado_hora_activa_idx on public.horarios_cuidado (cuidado_id, hora) where activo;
create index if not exists tareas_hogar_fecha_idx on public.tareas_programadas (hogar_id, programada_para);
create index if not exists tareas_mascota_fecha_idx on public.tareas_programadas (mascota_id, programada_para);
create index if not exists tareas_hecha_por_idx on public.tareas_programadas (hecha_por) where hecha_por is not null;
create index if not exists vacunas_mascota_idx on public.vacunas (mascota_id, aplicada_en desc);
create index if not exists vacunas_proxima_idx on public.vacunas (mascota_id, proxima_en) where proxima_en is not null;
create index if not exists visitas_mascota_idx on public.visitas_veterinario (mascota_id, fecha desc);
create index if not exists paseos_hogar_inicio_idx on public.paseos (hogar_id, iniciado_en desc);
create index if not exists paseos_registrado_por_idx on public.paseos (registrado_por);
create index if not exists paseo_mascotas_mascota_idx on public.paseo_mascotas (mascota_id);
create index if not exists incidentes_hogar_fecha_idx on public.incidentes (hogar_id, ocurrido_en desc);
create index if not exists incidentes_mascota_tipo_fecha_idx on public.incidentes (mascota_id, tipo, ocurrido_en desc);
create index if not exists incidentes_paseo_idx on public.incidentes (paseo_id) where paseo_id is not null;
create index if not exists incidentes_registrado_por_idx on public.incidentes (registrado_por);

-- actualizado_en en todas las tablas.
do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'perfiles', 'hogares', 'hogar_miembros', 'mascotas', 'cuidados', 'horarios_cuidado',
    'tareas_programadas', 'vacunas', 'visitas_veterinario', 'paseos', 'paseo_mascotas', 'incidentes'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.establecer_actualizado_en()',
      tabla || '_actualizado_en',
      tabla
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Funciones de acceso (SECURITY DEFINER para evitar recursión de RLS)
-- -----------------------------------------------------------------------------
create or replace function public.es_miembro_hogar(p_hogar_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hogar_miembros
    where hogar_id = p_hogar_id
      and usuario_id = (select auth.uid())
  );
$$;
comment on function public.es_miembro_hogar(uuid) is 'true si el usuario autenticado pertenece al hogar. Base de todas las políticas RLS.';

create or replace function public.puede_ver_mascota(p_mascota_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.mascotas as m
    join public.hogar_miembros as hm on hm.hogar_id = m.hogar_id
    where m.id = p_mascota_id
      and hm.usuario_id = (select auth.uid())
  );
$$;

create or replace function public.puede_ver_cuidado(p_cuidado_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cuidados as c
    join public.mascotas as m on m.id = c.mascota_id
    join public.hogar_miembros as hm on hm.hogar_id = m.hogar_id
    where c.id = p_cuidado_id
      and hm.usuario_id = (select auth.uid())
  );
$$;

create or replace function public.puede_ver_paseo(p_paseo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.paseos as p
    join public.hogar_miembros as hm on hm.hogar_id = p.hogar_id
    where p.id = p_paseo_id
      and hm.usuario_id = (select auth.uid())
  );
$$;

create or replace function public.comparte_hogar(p_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hogar_miembros as yo
    join public.hogar_miembros as otro on otro.hogar_id = yo.hogar_id
    where yo.usuario_id = (select auth.uid())
      and otro.usuario_id = p_usuario_id
  );
$$;

-- Fotos: la primera carpeta de la ruta es el hogar ({hogar_id}/{mascota_id}/archivo.jpg).
create or replace function public.puede_acceder_foto_mascota(p_nombre text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_carpeta text;
begin
  v_carpeta := (storage.foldername(p_nombre))[1];
  if v_carpeta is null
    or v_carpeta !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  return public.es_miembro_hogar(v_carpeta::uuid);
end;
$$;

-- Uso interno de triggers y funciones (no se exponen al cliente).
create or replace function public._hogar_de_mascota(p_mascota_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select hogar_id from public.mascotas where id = p_mascota_id;
$$;

create or replace function public._hogar_de_paseo(p_paseo_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select hogar_id from public.paseos where id = p_paseo_id;
$$;

-- -----------------------------------------------------------------------------
-- 5. Registro de usuarios: perfil + hogar + membresía como dueño
-- -----------------------------------------------------------------------------
create or replace function public._crear_perfil_y_hogar(p_usuario_id uuid, p_email text, p_metadatos jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_zona text;
  v_hogar_id uuid;
begin
  v_nombre := nullif(btrim(coalesce(p_metadatos ->> 'nombre', '')), '');
  if v_nombre is null then
    v_nombre := nullif(btrim(split_part(coalesce(p_email, ''), '@', 1)), '');
  end if;
  v_nombre := btrim(left(coalesce(v_nombre, 'Usuario'), 80));

  v_zona := p_metadatos ->> 'zona_horaria';
  if not public.es_zona_horaria_valida(v_zona) then
    v_zona := 'America/Hermosillo';
  end if;

  insert into public.perfiles (id, nombre, zona_horaria)
  values (p_usuario_id, v_nombre, v_zona)
  on conflict (id) do nothing;

  if not exists (select 1 from public.hogar_miembros where usuario_id = p_usuario_id) then
    insert into public.hogares (nombre, zona_horaria, creado_por)
    values (btrim(left('Hogar de ' || v_nombre, 80)), v_zona, p_usuario_id)
    returning id into v_hogar_id;

    insert into public.hogar_miembros (hogar_id, usuario_id, rol)
    values (v_hogar_id, p_usuario_id, 'dueño');
  end if;
end;
$$;

create or replace function public.al_registrar_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._crear_perfil_y_hogar(new.id, new.email, new.raw_user_meta_data);
  return new;
end;
$$;

drop trigger if exists petwatch_al_registrar_usuario on auth.users;
create trigger petwatch_al_registrar_usuario
after insert on auth.users
for each row execute function public.al_registrar_usuario();

-- -----------------------------------------------------------------------------
-- 6. Tareas: generación y reglas de cambio de estado
-- -----------------------------------------------------------------------------

-- Genera las tareas faltantes de los próximos p_dias días con la zona horaria
-- del hogar. Idempotente: ON CONFLICT (horario_id, programada_para) DO NOTHING.
create or replace function public._generar_tareas_hogar(p_hogar_id uuid, p_dias integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona text;
  v_hoy date;
  v_insertadas integer;
begin
  select zona_horaria into v_zona from public.hogares where id = p_hogar_id;
  if v_zona is null then
    return 0;
  end if;
  v_hoy := (pg_catalog.now() at time zone v_zona)::date;

  insert into public.tareas_programadas (horario_id, hogar_id, mascota_id, programada_para)
  select h.id, m.hogar_id, m.id, ((v_hoy + g.n) + h.hora) at time zone v_zona
  from public.horarios_cuidado as h
  join public.cuidados as c on c.id = h.cuidado_id
  join public.mascotas as m on m.id = c.mascota_id
  cross join pg_catalog.generate_series(0, p_dias - 1) as g(n)
  where m.hogar_id = p_hogar_id
    and m.activa
    and c.activo
    and h.activo
    and extract(dow from (v_hoy + g.n))::smallint = any (h.dias_semana)
    -- Un horario nuevo no crea tareas de horas que ya pasaron.
    and (((v_hoy + g.n) + h.hora) at time zone v_zona) >= h.creado_en
  on conflict (horario_id, programada_para) do nothing;

  get diagnostics v_insertadas = row_count;
  return v_insertadas;
end;
$$;

create or replace function public.generar_tareas(p_hogar_id uuid, p_dias integer default 14)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.es_miembro_hogar(p_hogar_id) then
    raise exception 'No perteneces a este hogar.' using errcode = '42501';
  end if;
  if p_dias is null or p_dias not between 1 and 31 then
    raise exception 'El número de días debe estar entre 1 y 31.' using errcode = '22023';
  end if;
  return public._generar_tareas_hogar(p_hogar_id, p_dias);
end;
$$;
comment on function public.generar_tareas(uuid, integer) is 'Genera las tareas de los próximos días (14 por defecto). La app la llama al abrir Hoy y al guardar cuidados.';

-- Completa hogar_id y mascota_id a partir del horario (no se confía en el cliente).
create or replace function public.tareas_completar_contexto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hogar_id uuid;
  v_mascota_id uuid;
begin
  select m.hogar_id, m.id
  into v_hogar_id, v_mascota_id
  from public.horarios_cuidado as h
  join public.cuidados as c on c.id = h.cuidado_id
  join public.mascotas as m on m.id = c.mascota_id
  where h.id = new.horario_id;

  if v_hogar_id is null then
    raise exception 'El horario de la tarea no existe.' using errcode = '23503';
  end if;
  new.hogar_id := v_hogar_id;
  new.mascota_id := v_mascota_id;
  return new;
end;
$$;

create trigger tareas_completar_contexto
before insert on public.tareas_programadas
for each row execute function public.tareas_completar_contexto();

-- Reglas al cambiar de estado:
--   * hecha y omitida son finales (repetir el mismo estado no hace nada).
--   * hecha_por / hecha_en los asigna el servidor con auth.uid().
--   * posponer exige una hora futura de máximo 24 horas.
create or replace function public.tareas_validar_cambio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
begin
  if old.estado in ('hecha', 'omitida') then
    if new.estado = old.estado then
      return old;
    end if;
    raise exception 'Esta tarea ya fue %.', old.estado using errcode = 'P0001';
  end if;

  -- La programación de la tarea no cambia desde la app.
  new.horario_id := old.horario_id;
  new.hogar_id := old.hogar_id;
  new.mascota_id := old.mascota_id;
  new.programada_para := old.programada_para;

  if new.estado = 'pendiente' and old.estado <> 'pendiente' then
    raise exception 'Una tarea no puede volver a pendiente.' using errcode = 'P0001';
  end if;

  if new.estado in ('hecha', 'omitida') then
    new.hecha_en := pg_catalog.now();
    new.hecha_por := coalesce(v_usuario, new.hecha_por);
    new.pospuesta_hasta := null;
  elsif new.estado = 'pospuesta' then
    if new.pospuesta_hasta is null
      or new.pospuesta_hasta <= pg_catalog.now()
      or new.pospuesta_hasta > pg_catalog.now() + interval '1 day' then
      raise exception 'Elige un tiempo futuro, de máximo 24 horas, para posponer la tarea.' using errcode = 'P0001';
    end if;
    new.hecha_en := null;
    new.hecha_por := null;
  else
    new.hecha_en := null;
    new.hecha_por := null;
    new.pospuesta_hasta := null;
  end if;
  return new;
end;
$$;

create trigger tareas_validar_cambio
before update on public.tareas_programadas
for each row execute function public.tareas_validar_cambio();

-- Al desactivar un horario, un cuidado o una mascota se borran sus tareas
-- futuras sin resolver. Las pasadas se conservan como historial.
create or replace function public.limpiar_tareas_futuras()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'horarios_cuidado' then
    delete from public.tareas_programadas
    where horario_id = new.id
      and estado in ('pendiente', 'pospuesta')
      and programada_para > pg_catalog.now();
  elsif tg_table_name = 'cuidados' then
    delete from public.tareas_programadas as t
    using public.horarios_cuidado as h
    where h.cuidado_id = new.id
      and t.horario_id = h.id
      and t.estado in ('pendiente', 'pospuesta')
      and t.programada_para > pg_catalog.now();
  elsif tg_table_name = 'mascotas' then
    delete from public.tareas_programadas
    where mascota_id = new.id
      and estado in ('pendiente', 'pospuesta')
      and programada_para > pg_catalog.now();
  end if;
  return null;
end;
$$;

create trigger horarios_cuidado_limpiar_tareas
after update of activo on public.horarios_cuidado
for each row when (old.activo and not new.activo)
execute function public.limpiar_tareas_futuras();

create trigger cuidados_limpiar_tareas
after update of activo on public.cuidados
for each row when (old.activo and not new.activo)
execute function public.limpiar_tareas_futuras();

create trigger mascotas_limpiar_tareas
after update of activa on public.mascotas
for each row when (old.activa and not new.activa)
execute function public.limpiar_tareas_futuras();

-- Si cambia la zona horaria del hogar, las tareas futuras pendientes se
-- regeneran a la nueva hora local.
create or replace function public.hogares_regenerar_tareas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.tareas_programadas
  where hogar_id = new.id
    and estado = 'pendiente'
    and programada_para > pg_catalog.now();
  perform public._generar_tareas_hogar(new.id, 14);
  return null;
end;
$$;

create trigger hogares_regenerar_tareas
after update of zona_horaria on public.hogares
for each row when (old.zona_horaria is distinct from new.zona_horaria)
execute function public.hogares_regenerar_tareas();

-- -----------------------------------------------------------------------------
-- 7. Cuidados: guardar cuidado y horarios en una sola transacción
-- -----------------------------------------------------------------------------
-- p_horarios: [{"hora": "08:00", "dias_semana": [1, 2, 3, 4, 5]}, ...]
-- SECURITY INVOKER: las políticas RLS del usuario siguen aplicando.
create or replace function public.guardar_cuidado(
  p_cuidado_id uuid,
  p_mascota_id uuid,
  p_tipo text,
  p_nombre text,
  p_detalle text,
  p_horarios jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cuidado_id uuid;
  v_hogar_id uuid;
  v_horario jsonb;
  v_hora time;
  v_dias smallint[];
  v_horas time[] := '{}';
  v_conjuntos text[] := '{}';
begin
  if p_tipo is null or p_tipo not in ('comida', 'medicamento', 'paseo', 'otro') then
    raise exception 'El tipo de cuidado no es válido.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_nombre, ''))) not between 1 and 60 then
    raise exception 'El nombre del cuidado debe tener entre 1 y 60 caracteres.' using errcode = '22023';
  end if;
  if p_detalle is not null and char_length(p_detalle) > 200 then
    raise exception 'El detalle no puede superar 200 caracteres.' using errcode = '22023';
  end if;
  if p_horarios is null or jsonb_typeof(p_horarios) <> 'array' then
    raise exception 'Agrega al menos un horario.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_horarios) not between 1 and 12 then
    raise exception 'Agrega entre 1 y 12 horarios.' using errcode = '22023';
  end if;

  -- Normaliza cada horario (hora sin segundos, días únicos y ordenados).
  for v_horario in select value from jsonb_array_elements(p_horarios) loop
    begin
      v_hora := (v_horario ->> 'hora')::time;
    exception
      when others then
        raise exception 'La hora "%" no es válida.', coalesce(v_horario ->> 'hora', '') using errcode = '22023';
    end;
    v_hora := make_time(extract(hour from v_hora)::integer, extract(minute from v_hora)::integer, 0);

    if jsonb_typeof(v_horario -> 'dias_semana') is distinct from 'array' then
      raise exception 'Selecciona al menos un día para cada horario.' using errcode = '22023';
    end if;
    begin
      select array_agg(distinct d.valor::smallint order by d.valor::smallint)
      into v_dias
      from jsonb_array_elements_text(v_horario -> 'dias_semana') as d(valor);
    exception
      when others then
        raise exception 'Los días de la semana no son válidos.' using errcode = '22023';
    end;
    if v_dias is null or not (v_dias <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]) then
      raise exception 'Selecciona al menos un día válido para cada horario.' using errcode = '22023';
    end if;
    if array_position(v_horas, v_hora) is not null then
      raise exception 'La hora % está repetida.', to_char(v_hora, 'HH24:MI') using errcode = '22023';
    end if;

    v_horas := array_append(v_horas, v_hora);
    v_conjuntos := array_append(v_conjuntos, v_dias::text);
  end loop;

  -- Crea o actualiza el cuidado (RLS valida que la mascota sea de tu hogar).
  if p_cuidado_id is null then
    insert into public.cuidados (mascota_id, tipo, nombre, detalle)
    values (p_mascota_id, p_tipo, btrim(p_nombre), nullif(btrim(coalesce(p_detalle, '')), ''))
    returning id into v_cuidado_id;
  else
    update public.cuidados
    set tipo = p_tipo,
        nombre = btrim(p_nombre),
        detalle = nullif(btrim(coalesce(p_detalle, '')), '')
    where id = p_cuidado_id
      and mascota_id = p_mascota_id
    returning id into v_cuidado_id;

    if v_cuidado_id is null then
      raise exception 'No se encontró el cuidado.' using errcode = 'P0002';
    end if;
  end if;

  -- Desactiva los horarios que ya no están (el trigger borra sus tareas futuras).
  update public.horarios_cuidado as h
  set activo = false
  where h.cuidado_id = v_cuidado_id
    and h.activo
    and not exists (
      select 1
      from unnest(v_horas, v_conjuntos) as n(hora, dias)
      where n.hora = h.hora
        and n.dias::smallint[] @> h.dias_semana
        and n.dias::smallint[] <@ h.dias_semana
    );

  -- Crea los horarios nuevos; los que no cambiaron se conservan.
  insert into public.horarios_cuidado (cuidado_id, hora, dias_semana)
  select v_cuidado_id, n.hora, n.dias::smallint[]
  from unnest(v_horas, v_conjuntos) as n(hora, dias)
  where not exists (
    select 1
    from public.horarios_cuidado as h
    where h.cuidado_id = v_cuidado_id
      and h.activo
      and h.hora = n.hora
      and n.dias::smallint[] @> h.dias_semana
      and n.dias::smallint[] <@ h.dias_semana
  );

  select hogar_id into v_hogar_id from public.mascotas where id = p_mascota_id;
  perform public.generar_tareas(v_hogar_id, 14);

  return v_cuidado_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Hogares: crear, invitar y unirse
-- -----------------------------------------------------------------------------
create or replace function public.crear_hogar(p_nombre text, p_zona_horaria text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_hogar_id uuid;
begin
  if v_usuario is null then
    raise exception 'Inicia sesión para crear un hogar.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_nombre, ''))) not between 1 and 80 then
    raise exception 'El nombre del hogar debe tener entre 1 y 80 caracteres.' using errcode = '22023';
  end if;
  if not public.es_zona_horaria_valida(p_zona_horaria) then
    raise exception 'La zona horaria no es válida.' using errcode = '22023';
  end if;
  if (select count(*) from public.hogar_miembros where usuario_id = v_usuario) >= 10 then
    raise exception 'Alcanzaste el máximo de 10 hogares.' using errcode = 'P0001';
  end if;

  insert into public.hogares (nombre, zona_horaria, creado_por)
  values (btrim(p_nombre), p_zona_horaria, v_usuario)
  returning id into v_hogar_id;

  insert into public.hogar_miembros (hogar_id, usuario_id, rol)
  values (v_hogar_id, v_usuario, 'dueño');

  return v_hogar_id;
end;
$$;

-- Cualquier miembro puede generar el código. Vence a los 7 días y uno nuevo
-- reemplaza al anterior.
create or replace function public.generar_codigo_invitacion(p_hogar_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_codigo text;
  v_bytes bytea;
  v_posicion integer;
  v_intento integer := 0;
begin
  if auth.uid() is null or not public.es_miembro_hogar(p_hogar_id) then
    raise exception 'No perteneces a este hogar.' using errcode = '42501';
  end if;

  loop
    v_intento := v_intento + 1;
    -- Bytes aleatorios de gen_random_uuid() (se omiten los bits fijos de versión).
    v_bytes := uuid_send(gen_random_uuid());
    v_codigo := '';
    foreach v_posicion in array array[0, 1, 2, 3, 4, 5, 7, 9] loop
      v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, v_posicion) % 31) + 1, 1);
    end loop;

    begin
      update public.hogares
      set codigo_invitacion = v_codigo,
          codigo_expira_en = pg_catalog.now() + interval '7 days'
      where id = p_hogar_id;
      return v_codigo;
    exception
      when unique_violation then
        if v_intento >= 5 then
          raise exception 'No se pudo generar un código único. Intenta de nuevo.';
        end if;
    end;
  end loop;
end;
$$;

-- Une al usuario con el código. Si su hogar anterior queda vacío (solo él, sin
-- mascotas ni paseos), se elimina para no dejar hogares sin uso.
create or replace function public.unirse_hogar(p_codigo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_hogar_id uuid;
begin
  if v_usuario is null then
    raise exception 'Inicia sesión para unirte a un hogar.' using errcode = '42501';
  end if;

  select id into v_hogar_id
  from public.hogares
  where codigo_invitacion = v_codigo
    and codigo_expira_en > pg_catalog.now();

  if v_hogar_id is null then
    raise exception 'El código no es válido o ya venció. Pide uno nuevo.' using errcode = 'P0002';
  end if;

  insert into public.hogar_miembros (hogar_id, usuario_id, rol)
  values (v_hogar_id, v_usuario, 'miembro')
  on conflict (hogar_id, usuario_id) do nothing;

  delete from public.hogares as h
  where h.id <> v_hogar_id
    and exists (select 1 from public.hogar_miembros as m where m.hogar_id = h.id and m.usuario_id = v_usuario)
    and not exists (select 1 from public.hogar_miembros as m where m.hogar_id = h.id and m.usuario_id <> v_usuario)
    and not exists (select 1 from public.mascotas as p where p.hogar_id = h.id)
    and not exists (select 1 from public.paseos as w where w.hogar_id = h.id);

  return v_hogar_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Paseos e incidentes
-- -----------------------------------------------------------------------------

-- Completa datos de los paseos: quién lo registró y la hora de fin.
create or replace function public.paseos_completar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.registrado_por := auth.uid();
  end if;
  if new.terminado_en is null and new.duracion_seg > 0 then
    new.terminado_en := new.iniciado_en + make_interval(secs => new.duracion_seg);
  end if;
  return new;
end;
$$;

create trigger paseos_completar
before insert on public.paseos
for each row execute function public.paseos_completar();

create or replace function public.paseo_mascotas_validar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public._hogar_de_mascota(new.mascota_id) is distinct from public._hogar_de_paseo(new.paseo_id) then
    raise exception 'La mascota no pertenece al hogar del paseo.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger paseo_mascotas_validar
before insert on public.paseo_mascotas
for each row execute function public.paseo_mascotas_validar();

-- Paseo manual desde la app (sin ruta). Inserta el paseo y sus mascotas en una
-- transacción. p_id viene del cliente: repetir la llamada no duplica el paseo.
create or replace function public.registrar_paseo(
  p_id uuid,
  p_hogar_id uuid,
  p_iniciado_en timestamptz,
  p_duracion_seg integer,
  p_distancia_m numeric,
  p_pasos integer,
  p_mascotas uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if p_mascotas is null or cardinality(p_mascotas) = 0 then
    raise exception 'Selecciona al menos una mascota.' using errcode = '22023';
  end if;
  if p_duracion_seg is null or p_duracion_seg not between 60 and 86400 then
    raise exception 'La duración debe estar entre 1 minuto y 24 horas.' using errcode = '22023';
  end if;
  if p_iniciado_en is null or p_iniciado_en > pg_catalog.now() + interval '5 minutes' then
    raise exception 'El paseo no puede empezar en el futuro.' using errcode = '22023';
  end if;

  insert into public.paseos (id, hogar_id, iniciado_en, terminado_en, duracion_seg, distancia_m, pasos, origen)
  values (
    v_id,
    p_hogar_id,
    p_iniciado_en,
    p_iniciado_en + make_interval(secs => p_duracion_seg),
    p_duracion_seg,
    p_distancia_m,
    p_pasos,
    'app'
  )
  on conflict (id) do nothing;

  insert into public.paseo_mascotas (paseo_id, mascota_id)
  select v_id, u.mascota
  from unnest(p_mascotas) as u(mascota)
  on conflict (paseo_id, mascota_id) do nothing;

  return v_id;
end;
$$;

-- Completa el hogar y quién registró el incidente (no se confía en el cliente).
create or replace function public.incidentes_completar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.hogar_id := public._hogar_de_mascota(new.mascota_id);
  if new.hogar_id is null then
    raise exception 'La mascota no existe.' using errcode = '23503';
  end if;
  if auth.uid() is not null then
    new.registrado_por := auth.uid();
  end if;
  if new.paseo_id is not null and public._hogar_de_paseo(new.paseo_id) is distinct from new.hogar_id then
    raise exception 'El paseo no pertenece al hogar de la mascota.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger incidentes_completar
before insert on public.incidentes
for each row execute function public.incidentes_completar();

-- -----------------------------------------------------------------------------
-- 10. RLS: acceso solo para miembros del hogar
-- -----------------------------------------------------------------------------
alter table public.perfiles enable row level security;
alter table public.hogares enable row level security;
alter table public.hogar_miembros enable row level security;
alter table public.mascotas enable row level security;
alter table public.cuidados enable row level security;
alter table public.horarios_cuidado enable row level security;
alter table public.tareas_programadas enable row level security;
alter table public.vacunas enable row level security;
alter table public.visitas_veterinario enable row level security;
alter table public.paseos enable row level security;
alter table public.paseo_mascotas enable row level security;
alter table public.incidentes enable row level security;

-- perfiles: cada quien edita el suyo; se ven los de quienes comparten hogar.
create policy perfiles_select on public.perfiles
for select to authenticated
using (id = (select auth.uid()) or public.comparte_hogar(id));

create policy perfiles_update on public.perfiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- hogares y miembros (el alta es con crear_hogar / unirse_hogar).
create policy hogares_select on public.hogares
for select to authenticated
using (public.es_miembro_hogar(id));

create policy hogares_update on public.hogares
for update to authenticated
using (public.es_miembro_hogar(id))
with check (public.es_miembro_hogar(id));

create policy hogar_miembros_select on public.hogar_miembros
for select to authenticated
using (public.es_miembro_hogar(hogar_id));

-- mascotas (sin borrado: se archivan con activa = false).
create policy mascotas_select on public.mascotas
for select to authenticated
using (public.es_miembro_hogar(hogar_id));

create policy mascotas_insert on public.mascotas
for insert to authenticated
with check (public.es_miembro_hogar(hogar_id));

create policy mascotas_update on public.mascotas
for update to authenticated
using (public.es_miembro_hogar(hogar_id))
with check (public.es_miembro_hogar(hogar_id));

-- cuidados y horarios (sin borrado: se desactivan para conservar el historial).
create policy cuidados_select on public.cuidados
for select to authenticated
using (public.puede_ver_mascota(mascota_id));

create policy cuidados_insert on public.cuidados
for insert to authenticated
with check (public.puede_ver_mascota(mascota_id));

create policy cuidados_update on public.cuidados
for update to authenticated
using (public.puede_ver_mascota(mascota_id))
with check (public.puede_ver_mascota(mascota_id));

create policy horarios_cuidado_select on public.horarios_cuidado
for select to authenticated
using (public.puede_ver_cuidado(cuidado_id));

create policy horarios_cuidado_insert on public.horarios_cuidado
for insert to authenticated
with check (public.puede_ver_cuidado(cuidado_id));

create policy horarios_cuidado_update on public.horarios_cuidado
for update to authenticated
using (public.puede_ver_cuidado(cuidado_id))
with check (public.puede_ver_cuidado(cuidado_id));

-- tareas (se crean con generar_tareas; la app solo cambia el estado).
create policy tareas_programadas_select on public.tareas_programadas
for select to authenticated
using (public.es_miembro_hogar(hogar_id));

create policy tareas_programadas_update on public.tareas_programadas
for update to authenticated
using (public.es_miembro_hogar(hogar_id))
with check (public.es_miembro_hogar(hogar_id));

-- vacunas y visitas al veterinario.
create policy vacunas_select on public.vacunas
for select to authenticated
using (public.puede_ver_mascota(mascota_id));

create policy vacunas_insert on public.vacunas
for insert to authenticated
with check (public.puede_ver_mascota(mascota_id));

create policy vacunas_update on public.vacunas
for update to authenticated
using (public.puede_ver_mascota(mascota_id))
with check (public.puede_ver_mascota(mascota_id));

create policy vacunas_delete on public.vacunas
for delete to authenticated
using (public.puede_ver_mascota(mascota_id));

create policy visitas_veterinario_select on public.visitas_veterinario
for select to authenticated
using (public.puede_ver_mascota(mascota_id));

create policy visitas_veterinario_insert on public.visitas_veterinario
for insert to authenticated
with check (public.puede_ver_mascota(mascota_id));

create policy visitas_veterinario_update on public.visitas_veterinario
for update to authenticated
using (public.puede_ver_mascota(mascota_id))
with check (public.puede_ver_mascota(mascota_id));

create policy visitas_veterinario_delete on public.visitas_veterinario
for delete to authenticated
using (public.puede_ver_mascota(mascota_id));

-- paseos y sus mascotas.
create policy paseos_select on public.paseos
for select to authenticated
using (public.es_miembro_hogar(hogar_id));

create policy paseos_insert on public.paseos
for insert to authenticated
with check (public.es_miembro_hogar(hogar_id) and registrado_por = (select auth.uid()));

create policy paseos_delete on public.paseos
for delete to authenticated
using (public.es_miembro_hogar(hogar_id));

create policy paseo_mascotas_select on public.paseo_mascotas
for select to authenticated
using (public.puede_ver_paseo(paseo_id));

create policy paseo_mascotas_insert on public.paseo_mascotas
for insert to authenticated
with check (public.puede_ver_paseo(paseo_id) and public.puede_ver_mascota(mascota_id));

create policy paseo_mascotas_delete on public.paseo_mascotas
for delete to authenticated
using (public.puede_ver_paseo(paseo_id));

-- incidentes.
create policy incidentes_select on public.incidentes
for select to authenticated
using (public.es_miembro_hogar(hogar_id));

create policy incidentes_insert on public.incidentes
for insert to authenticated
with check (public.es_miembro_hogar(hogar_id) and registrado_por = (select auth.uid()));

create policy incidentes_update on public.incidentes
for update to authenticated
using (public.es_miembro_hogar(hogar_id))
with check (public.es_miembro_hogar(hogar_id));

create policy incidentes_delete on public.incidentes
for delete to authenticated
using (public.es_miembro_hogar(hogar_id));

-- -----------------------------------------------------------------------------
-- 11. Privilegios: solo lo que la app necesita (por columna cuando aplica)
-- -----------------------------------------------------------------------------
revoke all on table
  public.perfiles, public.hogares, public.hogar_miembros, public.mascotas, public.cuidados,
  public.horarios_cuidado, public.tareas_programadas, public.vacunas, public.visitas_veterinario,
  public.paseos, public.paseo_mascotas, public.incidentes
from anon, authenticated, public;

grant select on table
  public.perfiles, public.hogares, public.hogar_miembros, public.mascotas, public.cuidados,
  public.horarios_cuidado, public.tareas_programadas, public.vacunas, public.visitas_veterinario,
  public.paseos, public.paseo_mascotas, public.incidentes
to authenticated;

grant update (nombre, zona_horaria) on public.perfiles to authenticated;
grant update (nombre, zona_horaria) on public.hogares to authenticated;

grant insert (id, hogar_id, nombre, especie, raza, sexo, fecha_nacimiento, peso_kg, foto_url, meta_paseo_min_dia, notas, activa)
  on public.mascotas to authenticated;
grant update (nombre, especie, raza, sexo, fecha_nacimiento, peso_kg, foto_url, meta_paseo_min_dia, notas, activa)
  on public.mascotas to authenticated;

grant insert (id, mascota_id, tipo, nombre, detalle, activo) on public.cuidados to authenticated;
grant update (tipo, nombre, detalle, activo) on public.cuidados to authenticated;

grant insert (id, cuidado_id, hora, dias_semana, activo) on public.horarios_cuidado to authenticated;
grant update (activo) on public.horarios_cuidado to authenticated;

grant update (estado, pospuesta_hasta) on public.tareas_programadas to authenticated;

grant insert (id, mascota_id, nombre, aplicada_en, proxima_en, veterinario, notas) on public.vacunas to authenticated;
grant update (nombre, aplicada_en, proxima_en, veterinario, notas) on public.vacunas to authenticated;
grant delete on public.vacunas to authenticated;

grant insert (id, mascota_id, fecha, clinica, motivo, diagnostico, tratamiento, costo, notas)
  on public.visitas_veterinario to authenticated;
grant update (fecha, clinica, motivo, diagnostico, tratamiento, costo, notas)
  on public.visitas_veterinario to authenticated;
grant delete on public.visitas_veterinario to authenticated;

grant insert (id, hogar_id, iniciado_en, terminado_en, duracion_seg, distancia_m, pasos, ruta, origen, dispositivo_id)
  on public.paseos to authenticated;
grant delete on public.paseos to authenticated;

grant insert (id, paseo_id, mascota_id) on public.paseo_mascotas to authenticated;
grant delete on public.paseo_mascotas to authenticated;

grant insert (id, mascota_id, tipo, ocurrido_en, lat, lng, paseo_id, nota, origen, dispositivo_id)
  on public.incidentes to authenticated;
grant update (nota) on public.incidentes to authenticated;
grant delete on public.incidentes to authenticated;

-- Funciones: nadie las ejecuta por defecto; se concede solo lo necesario.
revoke all on function
  public.establecer_actualizado_en(),
  public.es_zona_horaria_valida(text),
  public.es_miembro_hogar(uuid),
  public.puede_ver_mascota(uuid),
  public.puede_ver_cuidado(uuid),
  public.puede_ver_paseo(uuid),
  public.comparte_hogar(uuid),
  public.puede_acceder_foto_mascota(text),
  public._hogar_de_mascota(uuid),
  public._hogar_de_paseo(uuid),
  public._crear_perfil_y_hogar(uuid, text, jsonb),
  public.al_registrar_usuario(),
  public._generar_tareas_hogar(uuid, integer),
  public.generar_tareas(uuid, integer),
  public.tareas_completar_contexto(),
  public.tareas_validar_cambio(),
  public.limpiar_tareas_futuras(),
  public.hogares_regenerar_tareas(),
  public.guardar_cuidado(uuid, uuid, text, text, text, jsonb),
  public.crear_hogar(text, text),
  public.generar_codigo_invitacion(uuid),
  public.unirse_hogar(text),
  public.paseos_completar(),
  public.paseo_mascotas_validar(),
  public.registrar_paseo(uuid, uuid, timestamptz, integer, numeric, integer, uuid[]),
  public.incidentes_completar()
from public, anon, authenticated;

-- Usadas por checks y políticas RLS (se evalúan con el rol del usuario).
grant execute on function
  public.es_zona_horaria_valida(text),
  public.es_miembro_hogar(uuid),
  public.puede_ver_mascota(uuid),
  public.puede_ver_cuidado(uuid),
  public.puede_ver_paseo(uuid),
  public.comparte_hogar(uuid),
  public.puede_acceder_foto_mascota(text)
to authenticated, service_role;

-- RPC que llama la app.
grant execute on function
  public.generar_tareas(uuid, integer),
  public.guardar_cuidado(uuid, uuid, text, text, text, jsonb),
  public.crear_hogar(text, text),
  public.generar_codigo_invitacion(uuid),
  public.unirse_hogar(text),
  public.registrar_paseo(uuid, uuid, timestamptz, integer, numeric, integer, uuid[])
to authenticated;

-- Para las Edge Functions del reloj (fase posterior).
grant execute on function
  public._hogar_de_mascota(uuid),
  public._hogar_de_paseo(uuid),
  public._generar_tareas_hogar(uuid, integer)
to service_role;

-- -----------------------------------------------------------------------------
-- 12. Usuarios que ya existían antes de esta migración
-- -----------------------------------------------------------------------------
do $$
declare
  usuario record;
begin
  for usuario in
    select au.id, au.email, au.raw_user_meta_data
    from auth.users as au
    where not exists (select 1 from public.perfiles as p where p.id = au.id)
  loop
    perform public._crear_perfil_y_hogar(usuario.id, usuario.email, usuario.raw_user_meta_data);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 13. Realtime
-- -----------------------------------------------------------------------------
do $$
declare
  tabla text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No existe la publicación supabase_realtime. Activa Realtime en el panel de Supabase.';
    return;
  end if;

  foreach tabla in array array['tareas_programadas', 'incidentes', 'paseos'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tabla
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tabla);
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 14. Storage: bucket privado de fotos con acceso por hogar
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotos-mascotas',
  'fotos-mascotas',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists petwatch_fotos_select on storage.objects;
drop policy if exists petwatch_fotos_insert on storage.objects;
drop policy if exists petwatch_fotos_update on storage.objects;
drop policy if exists petwatch_fotos_delete on storage.objects;

create policy petwatch_fotos_select on storage.objects
for select to authenticated
using (bucket_id = 'fotos-mascotas' and public.puede_acceder_foto_mascota(name));

create policy petwatch_fotos_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'fotos-mascotas' and public.puede_acceder_foto_mascota(name));

create policy petwatch_fotos_update on storage.objects
for update to authenticated
using (bucket_id = 'fotos-mascotas' and public.puede_acceder_foto_mascota(name))
with check (bucket_id = 'fotos-mascotas' and public.puede_acceder_foto_mascota(name));

create policy petwatch_fotos_delete on storage.objects
for delete to authenticated
using (bucket_id = 'fotos-mascotas' and public.puede_acceder_foto_mascota(name));

commit;

-- Pide a PostgREST que recargue el esquema para exponer las tablas y funciones nuevas.
notify pgrst, 'reload schema';
