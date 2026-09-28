-- Desde cuando cuenta el historial.
--
-- Agosto 2026 fue la prueba del app: gastos inventados para ver si el reparto,
-- el OCR y la subida a Drive funcionaban. Septiembre es el primer mes real.
-- Dejarlos juntos deformaba el acumulado: en agosto Tomas puso 2396.20 de
-- 2468.20 (el alquiler entero), y ese superavit tapaba el saldo real.
--
-- No se borran: siguen en la base y en Drive, por si algun dia hacen falta.
-- Simplemente el saldo arranca en el periodo de inicio.

alter table configuracion
  add column if not exists periodo_inicio text;

update configuracion set periodo_inicio = '2026-09', actualizado_en = now()
where id = 1;

-- configuracion tiene RLS sin ninguna politica: solo el service role la lee.
-- Las vistas son security_invoker, asi que no pueden mirarla directamente y
-- el corte tiene que venir por una funcion definer.
create or replace function fn_periodo_inicio() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select periodo_inicio from configuracion where id = 1), '0000-00');
$$;

revoke all on function fn_periodo_inicio() from public, anon;
grant execute on function fn_periodo_inicio() to authenticated;

create or replace view v_balance with (security_invoker = on) as
with pagado as (
  select pagado_por as usuario_id, sum(monto_pen) as total
  from gastos where periodo >= fn_periodo_inicio() group by 1
),
debido as (
  select p.usuario_id, sum(p.monto_asignado) as total
  from gasto_participaciones p
  join gastos g on g.id = p.gasto_id
  where g.periodo >= fn_periodo_inicio() group by 1
),
enviadas as (
  select de_usuario as usuario_id, sum(monto) as total
  from liquidaciones where to_char(fecha, 'YYYY-MM') >= fn_periodo_inicio() group by 1
),
recibidas as (
  select a_usuario as usuario_id, sum(monto) as total
  from liquidaciones where to_char(fecha, 'YYYY-MM') >= fn_periodo_inicio() group by 1
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

-- El mismo corte para el balance por mes, para que la vista de historial que
-- viene no liste agosto.
create or replace view v_balance_mes with (security_invoker = on) as
with periodos as (
  select distinct periodo from gastos
  union
  select to_char(fecha, 'YYYY-MM') from liquidaciones
),
pagado as (
  select periodo, pagado_por as usuario_id, sum(monto_pen) as total
  from gastos group by 1, 2
),
debido as (
  select g.periodo, p.usuario_id, sum(p.monto_asignado) as total
  from gasto_participaciones p
  join gastos g on g.id = p.gasto_id
  group by 1, 2
),
enviadas as (
  select to_char(fecha, 'YYYY-MM') as periodo, de_usuario as usuario_id, sum(monto) as total
  from liquidaciones group by 1, 2
),
recibidas as (
  select to_char(fecha, 'YYYY-MM') as periodo, a_usuario as usuario_id, sum(monto) as total
  from liquidaciones group by 1, 2
)
select
  x.periodo,
  u.id as usuario_id,
  u.nombre,
  u.emoji,
  coalesce(p.total, 0) as total_pagado,
  coalesce(d.total, 0) as total_debido,
  coalesce(e.total, 0) as liquidaciones_enviadas,
  coalesce(r.total, 0) as liquidaciones_recibidas,
  round(
    coalesce(p.total, 0) - coalesce(d.total, 0)
    + coalesce(e.total, 0) - coalesce(r.total, 0)
  , 2) as saldo
from periodos x
cross join usuarios u
left join pagado    p on p.periodo = x.periodo and p.usuario_id = u.id
left join debido    d on d.periodo = x.periodo and d.usuario_id = u.id
left join enviadas  e on e.periodo = x.periodo and e.usuario_id = u.id
left join recibidas r on r.periodo = x.periodo and r.usuario_id = u.id
where u.activo and x.periodo >= fn_periodo_inicio();

revoke all on v_balance_mes from anon;
grant select on v_balance_mes to authenticated;
