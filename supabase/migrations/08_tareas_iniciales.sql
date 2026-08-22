-- Tareas de limpieza típicas, alternadas entre los dos.
-- El icono es un identificador que el front mapea a un SVG propio.

insert into tareas (titulo, icono, frecuencia_dias, asignado_a, proxima_fecha, orden)
select v.titulo, v.icono, v.dias,
       (select id from usuarios where nombre = v.quien),
       current_date + v.desde,
       v.orden
from (values
  ('Sacar la basura',      'basura',   3,  'Tomás',  0, 1),
  ('Lavar los platos',     'platos',   1,  'Renata', 0, 2),
  ('Limpiar el baño',      'bano',     7,  'Renata', 2, 3),
  ('Barrer y trapear',     'piso',     7,  'Tomás',  1, 4),
  ('Lavar la ropa',        'ropa',     7,  'Tomás',  3, 5),
  ('Cambiar las sábanas',  'sabanas',  14, 'Renata', 5, 6),
  ('Limpiar la cocina',    'cocina',   4,  'Tomás',  2, 7)
) as v(titulo, icono, dias, quien, desde, orden)
where not exists (select 1 from tareas t where t.titulo = v.titulo);

-- Nutria, no castor: el emoji de Tomás estaba mal.
update usuarios set emoji = '🦦' where nombre = 'Tomás';
