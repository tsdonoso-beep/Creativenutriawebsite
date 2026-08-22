-- Trigger: materializa el reparto según reparto_tipo

create or replace function fn_sync_participaciones() returns trigger
language plpgsql as $$
declare
  n int;
begin
  -- 'custom': los porcentajes los manda el cliente, no tocamos nada
  if new.reparto_tipo = 'custom' then
    return new;
  end if;

  delete from gasto_participaciones where gasto_id = new.id;

  if new.reparto_tipo = 'personal' then
    insert into gasto_participaciones (gasto_id, usuario_id, porcentaje, monto_asignado)
    values (new.id, new.pagado_por, 100, new.monto_pen);

  elsif new.reparto_tipo = 'igual' then
    select count(*) into n from usuarios where activo;
    if n > 0 then
      insert into gasto_participaciones (gasto_id, usuario_id, porcentaje, monto_asignado)
      select new.id, u.id, round(100.0 / n, 2), round(new.monto_pen / n, 2)
      from usuarios u where u.activo;
    end if;

  else -- 'default': el porcentaje_default de cada usuario (60/40)
    insert into gasto_participaciones (gasto_id, usuario_id, porcentaje, monto_asignado)
    select new.id, u.id, u.porcentaje_default,
           round(new.monto_pen * u.porcentaje_default / 100, 2)
    from usuarios u where u.activo;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_participaciones_insert on gastos;
create trigger trg_participaciones_insert
after insert on gastos
for each row execute function fn_sync_participaciones();

drop trigger if exists trg_participaciones_update on gastos;
create trigger trg_participaciones_update
after update of monto, tipo_cambio, reparto_tipo, pagado_por on gastos
for each row execute function fn_sync_participaciones();

-- Vista: gasto con nombres resueltos (la usa el sync al Sheet y la UI)
create or replace view v_gastos_detalle with (security_invoker = on) as
select
  g.id, g.client_uuid, g.fecha_gasto, g.periodo,
  ur.nombre as registrado_por_nombre,
  up.nombre as pagado_por_nombre,
  c.nombre  as categoria, c.emoji as categoria_emoji,
  g.comercio, g.descripcion, g.monto, g.moneda, g.tipo_cambio, g.monto_pen,
  g.metodo_pago, g.reparto_tipo,
  g.drive_url, g.drive_estado, g.fecha_registro
from gastos g
join usuarios ur on ur.id = g.registrado_por
join usuarios up on up.id = g.pagado_por
left join categorias c on c.id = g.categoria_id;

-- Vista: saldo neto por persona (positivo = le deben)
create or replace view v_balance with (security_invoker = on) as
with pagado as (
  select pagado_por as usuario_id, sum(monto_pen) as total
  from gastos group by 1
),
debido as (
  select usuario_id, sum(monto_asignado) as total
  from gasto_participaciones group by 1
),
enviadas as (
  select de_usuario as usuario_id, sum(monto) as total
  from liquidaciones group by 1
),
recibidas as (
  select a_usuario as usuario_id, sum(monto) as total
  from liquidaciones group by 1
)
select
  u.id as usuario_id,
  u.nombre,
  u.emoji,
  coalesce(p.total, 0)  as total_pagado,
  coalesce(d.total, 0)  as total_debido,
  coalesce(e.total, 0)  as liquidaciones_enviadas,
  coalesce(r.total, 0)  as liquidaciones_recibidas,
  round(
    coalesce(p.total, 0) - coalesce(d.total, 0)
    + coalesce(e.total, 0) - coalesce(r.total, 0)
  , 2) as saldo
from usuarios u
left join pagado    p on p.usuario_id = u.id
left join debido    d on d.usuario_id = u.id
left join enviadas  e on e.usuario_id = u.id
left join recibidas r on r.usuario_id = u.id
where u.activo;

-- Vista: totales por mes y categoría
create or replace view v_resumen_mensual with (security_invoker = on) as
select
  g.periodo,
  c.nombre as categoria,
  c.emoji  as categoria_emoji,
  count(*)          as cantidad,
  sum(g.monto_pen)  as total_pen
from gastos g
left join categorias c on c.id = g.categoria_id
group by g.periodo, c.nombre, c.emoji;

-- Vista: total del mes
create or replace view v_resumen_periodo with (security_invoker = on) as
select
  periodo,
  count(*)         as cantidad,
  sum(monto_pen)   as total_pen,
  min(fecha_gasto) as desde,
  max(fecha_gasto) as hasta
from gastos
group by periodo;
