insert into usuarios (nombre, emoji, color, porcentaje_default, orden) values
  ('Tomás',  '🦫', '#2563eb', 60.00, 1),
  ('Renata', '🦦', '#db2777', 40.00, 2)
on conflict (nombre) do update
  set porcentaje_default = excluded.porcentaje_default,
      emoji = excluded.emoji,
      color = excluded.color,
      orden = excluded.orden;

insert into categorias (nombre, emoji, orden) values
  ('Supermercado', '🛒', 1),
  ('Comida',       '🍔', 2),
  ('Hogar',        '🏠', 3),
  ('Transporte',   '🚌', 4),
  ('Servicios',    '💡', 5),
  ('Otros',        '📦', 6)
on conflict (nombre) do nothing;
