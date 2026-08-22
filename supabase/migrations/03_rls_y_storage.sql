-- RLS: lectura pública con la anon key, escrituras solo vía Edge Functions (service role)

alter table usuarios              enable row level security;
alter table categorias            enable row level security;
alter table gastos                enable row level security;
alter table gasto_participaciones enable row level security;
alter table liquidaciones         enable row level security;
alter table configuracion         enable row level security;

drop policy if exists lectura_anon on usuarios;
create policy lectura_anon on usuarios
  for select to anon, authenticated using (true);

drop policy if exists lectura_anon on categorias;
create policy lectura_anon on categorias
  for select to anon, authenticated using (true);

drop policy if exists lectura_anon on gastos;
create policy lectura_anon on gastos
  for select to anon, authenticated using (true);

drop policy if exists lectura_anon on gasto_participaciones;
create policy lectura_anon on gasto_participaciones
  for select to anon, authenticated using (true);

drop policy if exists lectura_anon on liquidaciones;
create policy lectura_anon on liquidaciones
  for select to anon, authenticated using (true);

-- configuracion: sin políticas a propósito. Solo el service role la ve
-- (guarda los IDs de Drive y del Sheet).

-- Bucket privado para las boletas antes de irse a Drive
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boletas', 'boletas', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;
