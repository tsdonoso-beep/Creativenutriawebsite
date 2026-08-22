-- LA NUTRIA APP · esquema base

create extension if not exists pgcrypto;

-- Usuarios: Tomás y Renata
create table if not exists usuarios (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null unique,
  emoji               text default '🙂',
  color               text,
  porcentaje_default  numeric(5,2) not null default 50
                        check (porcentaje_default >= 0 and porcentaje_default <= 100),
  activo              boolean not null default true,
  orden               int not null default 0,
  creado_en           timestamptz not null default now()
);

-- Categorías de gasto
create table if not exists categorias (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null unique,
  emoji     text,
  orden     int not null default 0,
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Configuración singleton (IDs de Drive / Sheet)
create table if not exists configuracion (
  id                      int primary key default 1 check (id = 1),
  drive_parent_id         text,
  drive_root_folder_id    text,
  sheet_id                text,
  moneda_default          text not null default 'PEN',
  tipo_cambio_referencial numeric(10,4) not null default 3.75,
  actualizado_en          timestamptz not null default now()
);
insert into configuracion (id) values (1) on conflict (id) do nothing;

-- Gastos
create table if not exists gastos (
  id              uuid primary key default gen_random_uuid(),
  client_uuid     uuid not null unique,
  registrado_por  uuid not null references usuarios(id),
  pagado_por      uuid not null references usuarios(id),
  categoria_id    uuid references categorias(id),
  monto           numeric(12,2) not null check (monto > 0),
  moneda          text not null default 'PEN' check (moneda in ('PEN','USD')),
  tipo_cambio     numeric(10,4) not null default 1 check (tipo_cambio > 0),
  monto_pen       numeric(12,2) generated always as (round(monto * tipo_cambio, 2)) stored,
  comercio        text,
  descripcion     text,
  fecha_gasto     date not null default current_date,
  periodo         text generated always as (
                    extract(year from fecha_gasto)::text || '-' ||
                    lpad(extract(month from fecha_gasto)::text, 2, '0')
                  ) stored,
  metodo_pago     text,
  reparto_tipo    text not null default 'default'
                    check (reparto_tipo in ('default','igual','personal','custom')),
  imagen_path     text,
  mime            text,
  drive_file_id   text,
  drive_url       text,
  drive_estado    text not null default 'sin_foto'
                    check (drive_estado in ('sin_foto','pendiente','subido','error')),
  drive_error     text,
  drive_intentos  int not null default 0,
  ocr_json        jsonb,
  confianza_ocr   numeric(5,2),
  fecha_registro  timestamptz not null default now()
);

-- Reparto: quién debe cuánto de cada gasto
create table if not exists gasto_participaciones (
  id             uuid primary key default gen_random_uuid(),
  gasto_id       uuid not null references gastos(id) on delete cascade,
  usuario_id     uuid not null references usuarios(id),
  porcentaje     numeric(5,2) not null check (porcentaje >= 0 and porcentaje <= 100),
  monto_asignado numeric(12,2) not null default 0,
  unique (gasto_id, usuario_id)
);

-- Liquidaciones entre ellos
create table if not exists liquidaciones (
  id          uuid primary key default gen_random_uuid(),
  client_uuid uuid unique,
  de_usuario  uuid not null references usuarios(id),
  a_usuario   uuid not null references usuarios(id),
  monto       numeric(12,2) not null check (monto > 0),
  fecha       date not null default current_date,
  metodo      text,
  nota        text,
  creado_en   timestamptz not null default now(),
  check (de_usuario <> a_usuario)
);

-- Índices
create index if not exists idx_gastos_periodo      on gastos (periodo);
create index if not exists idx_gastos_fecha        on gastos (fecha_gasto desc);
create index if not exists idx_gastos_categoria    on gastos (categoria_id);
create index if not exists idx_gastos_pagado_por   on gastos (pagado_por);
create index if not exists idx_gastos_drive_cola   on gastos (drive_estado)
  where drive_estado in ('pendiente','error');
create index if not exists idx_particip_usuario    on gasto_participaciones (usuario_id);
create index if not exists idx_particip_gasto      on gasto_participaciones (gasto_id);
