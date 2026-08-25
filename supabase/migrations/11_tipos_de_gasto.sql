-- Nivel por encima de la categoria: el TIPO decide como se reparte la plata.
-- Al elegir la categoria, la app ya sabe si va 60/40 o mitad y mitad.
--
-- "Personal" no es un tipo: un gasto personal igual es comida o transporte.
-- Eso se resuelve con el boton de reparto, que ya existe.

create table if not exists tipos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null unique,
  descripcion      text,
  reparto_default  text not null default 'default'
                     check (reparto_default in ('default', 'igual', 'personal')),
  color            text,
  orden            int not null default 0,
  activo           boolean not null default true,
  creado_en        timestamptz not null default now()
);

insert into tipos (nombre, descripcion, reparto_default, color, orden) values
  ('Gastos mensuales', 'Lo que se repite cada mes: servicios, comida, limpieza', 'default', '#DB7C39', 1),
  ('Cosas de la casa',  'Lo que se queda en la casa: muebles, decoracion, utensilios', 'igual', '#6C9066', 2)
on conflict (nombre) do update
  set reparto_default = excluded.reparto_default,
      descripcion     = excluded.descripcion,
      color           = excluded.color;

alter table categorias add column if not exists tipo_id uuid references tipos(id);

-- "Hogar" era ambiguo: el detergente es mensual, la mesa de sala no.
update categorias set nombre = 'Limpieza', emoji = '🧽' where nombre = 'Hogar';

update categorias
set tipo_id = (select id from tipos where nombre = 'Gastos mensuales')
where tipo_id is null;

insert into categorias (nombre, emoji, orden, tipo_id)
select v.nombre, v.emoji, v.orden, (select id from tipos where nombre = 'Gastos mensuales')
from (values
  ('Alquiler','🔑',1),('Mantenimiento','🧰',2),('Luz','💡',3),
  ('Gas','🔥',4),('Internet','📶',5),('Salud','💊',9)
) as v(nombre, emoji, orden)
where not exists (select 1 from categorias c where c.nombre = v.nombre);

insert into categorias (nombre, emoji, orden, tipo_id)
select v.nombre, v.emoji, v.orden, (select id from tipos where nombre = 'Cosas de la casa')
from (values
  ('Muebles','🪑',1),('Decoracion','🖼️',2),('Electrodomesticos','🔌',3),
  ('Utensilios','🍽️',4),('Mejoras','🔨',5)
) as v(nombre, emoji, orden)
where not exists (select 1 from categorias c where c.nombre = v.nombre);

update categorias set orden = 6  where nombre = 'Supermercado';
update categorias set orden = 7  where nombre = 'Comida';
update categorias set orden = 8  where nombre = 'Limpieza';
update categorias set orden = 10 where nombre = 'Transporte';
update categorias set orden = 11 where nombre = 'Otros';
update categorias set activo = false where nombre = 'Servicios';

alter table tipos enable row level security;
drop policy if exists lectura_casa on tipos;
create policy lectura_casa on tipos for select to authenticated using (es_de_la_casa());
