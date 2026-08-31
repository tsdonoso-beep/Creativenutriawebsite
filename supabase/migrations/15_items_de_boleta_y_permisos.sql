-- 1. El linter avisa que anon puede ejecutar las funciones security definer.
--    "revoke from public" no alcanza porque Supabase le concede EXECUTE a anon
--    de forma explicita, asi que hay que revocarselo por nombre.

revoke execute on function es_de_la_casa() from anon;
revoke execute on function pagar_servicio(uuid, uuid, numeric, date, uuid) from anon;
revoke execute on function generar_pagos_mes(text) from anon;
revoke execute on function completar_tarea(uuid, uuid) from anon;

-- 2. El detalle de la boleta: que se compro y a cuanto.
--    Gemini ya leia los productos, pero se tiraban a la basura porque nadie
--    los guardaba. Aqui viven, y con ellos se puede responder "cuanto costo
--    el queso la ultima vez".

create table if not exists gasto_items (
  id        uuid primary key default gen_random_uuid(),
  gasto_id  uuid not null references gastos(id) on delete cascade,
  nombre    text not null,
  cantidad  numeric(10,3),
  precio    numeric(12,2),
  unidad    text,
  orden     int not null default 0,
  creado_en timestamptz not null default now()
);

create index if not exists idx_items_gasto  on gasto_items (gasto_id, orden);
create index if not exists idx_items_nombre on gasto_items (lower(nombre));

alter table gasto_items enable row level security;
drop policy if exists lectura_casa on gasto_items;
create policy lectura_casa on gasto_items
  for select to authenticated using (es_de_la_casa());

-- Historial de precios de un producto
create or replace view v_precios_productos with (security_invoker = on) as
select
  lower(i.nombre)            as producto,
  min(i.nombre)              as nombre,
  count(*)                   as veces,
  round(avg(i.precio), 2)    as precio_promedio,
  min(i.precio)              as mas_barato,
  max(i.precio)              as mas_caro,
  max(g.fecha_gasto)         as ultima_compra,
  (array_agg(i.precio order by g.fecha_gasto desc))[1] as ultimo_precio,
  (array_agg(g.comercio order by g.fecha_gasto desc))[1] as ultimo_comercio
from gasto_items i
join gastos g on g.id = i.gasto_id
where i.precio is not null
group by lower(i.nombre);

create or replace view v_gasto_items with (security_invoker = on) as
select i.*, g.fecha_gasto, g.comercio, g.periodo
from gasto_items i
join gastos g on g.id = i.gasto_id;
