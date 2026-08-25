-- Exigir sesion no basta: si el registro publico quedara abierto, cualquiera
-- podria crearse una cuenta y ver todo. Asi que ademas de tener sesion, el
-- correo tiene que estar en una lista blanca. Asi la seguridad no depende de
-- un interruptor del panel que alguien pueda encender sin darse cuenta.

alter table configuracion
  add column if not exists emails_permitidos text[] not null default '{}';

/**
 * Es de la casa si su correo esta en la lista. Va como security definer
 * porque configuracion no tiene politicas: nadie la lee salvo el service role.
 */
create or replace function es_de_la_casa() returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from configuracion c, unnest(c.emails_permitidos) as correo
    where c.id = 1
      and lower(correo) = lower(auth.jwt() ->> 'email')
  );
$$;

revoke all on function es_de_la_casa() from public;
grant execute on function es_de_la_casa() to authenticated;

drop policy if exists lectura_sesion on usuarios;
create policy lectura_casa on usuarios for select to authenticated using (es_de_la_casa());

drop policy if exists lectura_sesion on categorias;
create policy lectura_casa on categorias for select to authenticated using (es_de_la_casa());

drop policy if exists lectura_sesion on gastos;
create policy lectura_casa on gastos for select to authenticated using (es_de_la_casa());

drop policy if exists lectura_sesion on gasto_participaciones;
create policy lectura_casa on gasto_participaciones for select to authenticated using (es_de_la_casa());

drop policy if exists lectura_sesion on liquidaciones;
create policy lectura_casa on liquidaciones for select to authenticated using (es_de_la_casa());

drop policy if exists todo_sesion on lista_items;
create policy todo_casa on lista_items
  for all to authenticated using (es_de_la_casa()) with check (es_de_la_casa());

drop policy if exists todo_sesion on tareas;
create policy todo_casa on tareas
  for all to authenticated using (es_de_la_casa()) with check (es_de_la_casa());

drop policy if exists todo_sesion on tarea_completadas;
create policy todo_casa on tarea_completadas
  for all to authenticated using (es_de_la_casa()) with check (es_de_la_casa());
