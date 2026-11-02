-- Desglose de boletas: a que se refiere cada linea.
--
-- gasto_items guardaba nombre, cantidad y precio. Dos cosas faltaban:
--
--  * detalle: a que hace referencia la linea. El ticket trae abreviaturas
--    ("LAIVECSAL180", "MASKTAPEX 2'' PEGAF") que no dicen mucho al releerlas
--    meses despues; aqui se guarda lo que el ticket decia y que producto es.
--  * descuento: dos de las boletas de octubre traen descuentos por linea.
--    precio guarda lo que realmente se pago por la linea (ya con el descuento),
--    asi los productos suman el total de la boleta; descuento guarda cuanto se
--    ahorro, para poder reconstruir el precio de lista (precio + descuento).

alter table gasto_items
  add column if not exists detalle   text,
  add column if not exists descuento numeric(12,2) not null default 0
    check (descuento >= 0);

comment on column gasto_items.detalle   is 'A que se refiere la linea: texto del ticket y que producto es.';
comment on column gasto_items.precio    is 'Lo pagado por la linea, ya con el descuento aplicado.';
comment on column gasto_items.descuento is 'Ahorro de la linea; precio de lista = precio + descuento.';

-- La vista se armo con i.*, que se expande al crearla: no ve las columnas
-- nuevas. Nada depende de ella, asi que se recrea.
drop view if exists v_gasto_items;
create view v_gasto_items with (security_invoker = on) as
select i.*, g.fecha_gasto, g.comercio, g.periodo
from gasto_items i
join gastos g on g.id = i.gasto_id;

revoke all on v_gasto_items from anon;
grant select on v_gasto_items to authenticated;

-- El detalle de productos vive en su propia hoja de calculo, no en la de
-- gastos: el CSV->Sheet de Drive solo crea una pestaña, y meter productos en
-- la hoja de gastos repetiria el monto de cada gasto en cada producto y
-- rompe cualquier suma de esa columna.
alter table configuracion
  add column if not exists sheet_detalle_id text;
