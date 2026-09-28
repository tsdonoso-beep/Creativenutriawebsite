-- Balance por mes.
--
-- v_balance es historico: arrastra todo desde el primer gasto. La tarjeta de
-- Inicio, en cambio, habla del mes ("EN QUE SE FUE SEPTIEMBRE", "puso cuanto
-- este mes"), asi que mezclarla con el saldo historico daba una contradiccion
-- visible: en septiembre Tomas puso menos del 60% que le toca, pero la linea
-- de abajo decia "Renata te debe" porque en agosto habia puesto de mas.
--
-- Las liquidaciones se imputan al mes de su fecha, con el mismo criterio.

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
where u.activo;

revoke all on v_balance_mes from anon;
grant select on v_balance_mes to authenticated;
