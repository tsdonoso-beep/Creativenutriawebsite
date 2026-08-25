-- Servicios a pagar: la plantilla recurrente y el pago de cada mes.
-- Al marcar un pago como hecho se crea el gasto, y recien ahi entra al balance.

create table if not exists servicios (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  categoria_id      uuid not null references categorias(id),
  proveedor         text,
  -- El numero de suministro permite reconocer solo de que servicio es un recibo
  numero_suministro text,
  monto_estimado    numeric(12,2) check (monto_estimado is null or monto_estimado >= 0),
  dia_vencimiento   int not null default 15 check (dia_vencimiento between 1 and 31),
  responsable_id    uuid references usuarios(id),
  aviso_dias_antes  int not null default 3 check (aviso_dias_antes >= 0),
  activo            boolean not null default true,
  orden             int not null default 0,
  notas             text,
  creado_en         timestamptz not null default now()
);

create table if not exists servicio_pagos (
  id                uuid primary key default gen_random_uuid(),
  servicio_id       uuid not null references servicios(id) on delete cascade,
  periodo           text not null,
  fecha_vencimiento date not null,
  monto             numeric(12,2) check (monto is null or monto >= 0),
  estado            text not null default 'pendiente'
                      check (estado in ('pendiente', 'pagado', 'omitido')),
  fecha_pago        date,
  pagado_por        uuid references usuarios(id),
  gasto_id          uuid references gastos(id) on delete set null,
  comprobante_path  text,
  mime              text,
  drive_file_id     text,
  drive_url         text,
  drive_estado      text not null default 'sin_foto'
                      check (drive_estado in ('sin_foto','pendiente','subido','error')),
  drive_error       text,
  drive_intentos    int not null default 0,
  ocr_json          jsonb,
  confianza_ocr     numeric(5,2),
  consumo           numeric(12,2),
  unidad_consumo    text,
  creado_en         timestamptz not null default now(),
  unique (servicio_id, periodo)
);

create index if not exists idx_pagos_periodo on servicio_pagos (periodo, fecha_vencimiento);
create index if not exists idx_pagos_estado  on servicio_pagos (estado, fecha_vencimiento);

/**
 * Crea los pagos del mes para los servicios activos.
 * Idempotente: si corre dos veces no duplica, gracias al unique.
 * El dia de vencimiento se recorta al ultimo dia del mes (un 31 en febrero
 * seria un error de fecha, no una excusa para no pagar).
 */
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

/**
 * Marca un pago como hecho y crea el gasto correspondiente, en una sola
 * operacion. El reparto sale del tipo de la categoria: la luz va 60/40
 * porque es un gasto mensual, sin que nadie tenga que elegirlo.
 */
create or replace function pagar_servicio(
  p_pago_id     uuid,
  p_usuario_id  uuid,
  p_monto       numeric default null,
  p_fecha       date default current_date,
  p_pagado_por  uuid default null
) returns servicio_pagos
language plpgsql
set search_path = public, pg_temp
as $$
declare
  pago     servicio_pagos;
  serv     servicios;
  reparto  text;
  quien    uuid;
  importe  numeric(12,2);
  nuevo    uuid;
begin
  select * into pago from servicio_pagos where id = p_pago_id;
  if not found then raise exception 'Pago no encontrado'; end if;
  if pago.estado = 'pagado' then return pago; end if;

  select * into serv from servicios where id = pago.servicio_id;

  importe := coalesce(p_monto, pago.monto, serv.monto_estimado);
  if importe is null or importe <= 0 then
    raise exception 'Falta el monto del recibo';
  end if;

  quien := coalesce(p_pagado_por, serv.responsable_id, p_usuario_id);

  select t.reparto_default into reparto
  from categorias c join tipos t on t.id = c.tipo_id
  where c.id = serv.categoria_id;

  insert into gastos (
    client_uuid, registrado_por, pagado_por, categoria_id,
    monto, comercio, descripcion, fecha_gasto, metodo_pago, reparto_tipo
  ) values (
    gen_random_uuid(), p_usuario_id, quien, serv.categoria_id,
    importe,
    coalesce(serv.proveedor, serv.nombre),
    serv.nombre || ' ' || pago.periodo,
    p_fecha, 'transferencia', coalesce(reparto, 'default')
  ) returning id into nuevo;

  update servicio_pagos set
    estado     = 'pagado',
    monto      = importe,
    fecha_pago = p_fecha,
    pagado_por = quien,
    gasto_id   = nuevo
  where id = p_pago_id
  returning * into pago;

  return pago;
end;
$$;

-- Vista para la pantalla de servicios: lo primero que se ve es cuando vence
-- y cuantos dias faltan.
create or replace view v_servicios with (security_invoker = on) as
select
  s.id as servicio_id, s.nombre, s.proveedor, s.numero_suministro,
  s.monto_estimado, s.dia_vencimiento, s.aviso_dias_antes, s.orden, s.notas,
  c.id as categoria_id, c.nombre as categoria, c.emoji as categoria_emoji,
  s.responsable_id, u.nombre as responsable, u.color as responsable_color,
  p.id as pago_id, p.periodo, p.fecha_vencimiento, p.monto, p.estado,
  p.fecha_pago, p.pagado_por, p.drive_url, p.comprobante_path,
  p.consumo, p.unidad_consumo, p.confianza_ocr,
  (p.fecha_vencimiento - current_date) as dias_faltantes,
  case
    when p.estado = 'pagado'                 then 'pagado'
    when p.fecha_vencimiento <  current_date then 'vencido'
    when p.fecha_vencimiento =  current_date then 'hoy'
    else 'proximo'
  end as urgencia
from servicios s
join categorias c on c.id = s.categoria_id
left join usuarios u on u.id = s.responsable_id
left join servicio_pagos p on p.servicio_id = s.id
where s.activo;

alter table servicios      enable row level security;
alter table servicio_pagos enable row level security;

drop policy if exists todo_casa on servicios;
create policy todo_casa on servicios
  for all to authenticated using (es_de_la_casa()) with check (es_de_la_casa());

drop policy if exists todo_casa on servicio_pagos;
create policy todo_casa on servicio_pagos
  for all to authenticated using (es_de_la_casa()) with check (es_de_la_casa());
