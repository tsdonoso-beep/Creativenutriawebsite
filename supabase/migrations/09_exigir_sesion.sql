-- La app va a estar publicada en la web, asi que la anon key deja de ser
-- suficiente: ahora hace falta una sesion iniciada. Se crea un unico usuario
-- para la casa y ambos entran con el.
-- (La 10 endurece esto ademas con una lista blanca de correos.)

drop policy if exists lectura_anon on usuarios;
create policy lectura_sesion on usuarios for select to authenticated using (true);

drop policy if exists lectura_anon on categorias;
create policy lectura_sesion on categorias for select to authenticated using (true);

drop policy if exists lectura_anon on gastos;
create policy lectura_sesion on gastos for select to authenticated using (true);

drop policy if exists lectura_anon on gasto_participaciones;
create policy lectura_sesion on gasto_participaciones for select to authenticated using (true);

drop policy if exists lectura_anon on liquidaciones;
create policy lectura_sesion on liquidaciones for select to authenticated using (true);

drop policy if exists todo_anon on lista_items;
create policy todo_sesion on lista_items for all to authenticated using (true) with check (true);

drop policy if exists todo_anon on tareas;
create policy todo_sesion on tareas for all to authenticated using (true) with check (true);

drop policy if exists todo_anon on tarea_completadas;
create policy todo_sesion on tarea_completadas for all to authenticated using (true) with check (true);
