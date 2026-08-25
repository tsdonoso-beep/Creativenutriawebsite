-- La variable se llamaba igual que la columna "periodo" y Postgres no sabia a
-- cual referirse dentro del insert. Las variables llevan el prefijo v_.
-- (La 12 ya incluye esta version corregida; esta migracion queda como registro
-- de lo que se aplico en produccion, en orden.)
create or replace function generar_pagos_mes(p_periodo text default null)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_periodo text := coalesce(p_periodo, to_char(current_date, 'YYYY-MM'));
  v_inicio  date;
  v_ultimo  int;
  v_n       int;
begin
  v_inicio := to_date(v_periodo || '-01', 'YYYY-MM-DD');
  v_ultimo := extract(day from (v_inicio + interval '1 month' - interval '1 day'))::int;

  insert into servicio_pagos (servicio_id, periodo, fecha_vencimiento, monto)
  select s.id, v_periodo,
         v_inicio + (least(s.dia_vencimiento, v_ultimo) - 1),
         s.monto_estimado
  from servicios s
  where s.activo
  on conflict (servicio_id, periodo) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
