-- Lista de compras compartida ------------------------------------------------

create table if not exists lista_items (
  id            uuid primary key default gen_random_uuid(),
  client_uuid   uuid unique,
  nombre        text not null,
  cantidad      numeric(10,2) not null default 1 check (cantidad > 0),
  unidad        text not null default 'u',
  nota          text,
  comprado      boolean not null default false,
  agregado_por  uuid references usuarios(id),
  comprado_por  uuid references usuarios(id),
  comprado_en   timestamptz,
  orden         int not null default 0,
  creado_en     timestamptz not null default now()
);

create index if not exists idx_lista_pendientes on lista_items (comprado, orden);

-- Marca la hora de compra sola, para poder agrupar "lo de esta salida"
create or replace function fn_marcar_compra() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.comprado and not old.comprado then
    new.comprado_en := now();
  elsif not new.comprado and old.comprado then
    new.comprado_en := null;
    new.comprado_por := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_marcar_compra on lista_items;
create trigger trg_marcar_compra
before update of comprado on lista_items
for each row execute function fn_marcar_compra();

-- Tareas de limpieza con rotación --------------------------------------------

create table if not exists tareas (
  id              uuid primary key default gen_random_uuid(),
  client_uuid     uuid unique,
  titulo          text not null,
  descripcion     text,
  icono           text,
  recurrente      boolean not null default true,
  frecuencia_dias int check (frecuencia_dias is null or frecuencia_dias > 0),
  rotar           boolean not null default true,
  asignado_a      uuid references usuarios(id),
  proxima_fecha   date not null default current_date,
  activa          boolean not null default true,
  orden           int not null default 0,
  creada_en       timestamptz not null default now(),
  -- una tarea recurrente necesita cada cuánto se repite
  check (not recurrente or frecuencia_dias is not null)
);

create index if not exists idx_tareas_pendientes on tareas (activa, proxima_fecha);

create table if not exists tarea_completadas (
  id            uuid primary key default gen_random_uuid(),
  tarea_id      uuid not null references tareas(id) on delete cascade,
  usuario_id    uuid not null references usuarios(id),
  fecha         date not null default current_date,
  completado_en timestamptz not null default now()
);

create index if not exists idx_completadas_tarea on tarea_completadas (tarea_id, fecha desc);

/**
 * Completa una tarea: la registra en el historial y, si es recurrente, la
 * reprograma pasándosela al otro. Es una sola operación para que el cliente
 * no tenga que orquestar tres pasos y quedarse a medias si se cae la señal.
 */
create or replace function completar_tarea(p_tarea_id uuid, p_usuario_id uuid)
returns tareas
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t         tareas;
  siguiente uuid;
begin
  select * into t from tareas where id = p_tarea_id;
  if not found then
    raise exception 'Tarea no encontrada';
  end if;

  insert into tarea_completadas (tarea_id, usuario_id)
  values (p_tarea_id, p_usuario_id);

  if t.recurrente then
    if t.rotar then
      -- con dos personas esto es "el otro"; con más, el siguiente por orden
      select u.id into siguiente
      from usuarios u
      where u.activo and u.id is distinct from coalesce(t.asignado_a, p_usuario_id)
      order by u.orden
      limit 1;
    end if;

    update tareas set
      proxima_fecha = greatest(current_date, proxima_fecha) + t.frecuencia_dias,
      asignado_a    = coalesce(siguiente, t.asignado_a)
    where id = p_tarea_id
    returning * into t;
  else
    update tareas set activa = false where id = p_tarea_id returning * into t;
  end if;

  return t;
end;
$$;

-- Vista: tareas pendientes con su estado y a quién le toca
create or replace view v_tareas_pendientes with (security_invoker = on) as
select
  t.id, t.titulo, t.descripcion, t.icono, t.frecuencia_dias, t.recurrente,
  t.proxima_fecha, t.orden,
  t.asignado_a,
  u.nombre as asignado_nombre,
  u.color  as asignado_color,
  (t.proxima_fecha - current_date) as dias_restantes,
  case
    when t.proxima_fecha <  current_date then 'vencida'
    when t.proxima_fecha =  current_date then 'hoy'
    else 'proxima'
  end as estado
from tareas t
left join usuarios u on u.id = t.asignado_a
where t.activa;

-- RLS: la lista y las tareas se escriben directo con la anon key. Son datos de
-- bajo riesgo y así funcionan bien offline; los gastos siguen pasando por las
-- Edge Functions por la idempotencia y las fotos.

alter table lista_items       enable row level security;
alter table tareas            enable row level security;
alter table tarea_completadas enable row level security;

drop policy if exists todo_anon on lista_items;
create policy todo_anon on lista_items
  for all to anon, authenticated using (true) with check (true);

drop policy if exists todo_anon on tareas;
create policy todo_anon on tareas
  for all to anon, authenticated using (true) with check (true);

drop policy if exists todo_anon on tarea_completadas;
create policy todo_anon on tarea_completadas
  for all to anon, authenticated using (true) with check (true);
