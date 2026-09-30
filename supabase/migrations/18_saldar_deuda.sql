-- Saldar una deuda entre los dos.
--
-- La tabla liquidaciones existia desde el esquema base y v_balance ya la
-- descuenta, pero la app no tenia como escribir en ella: solo hay politica de
-- lectura, y sin un boton la unica forma de "pagar lo que debo" era inventar
-- un gasto. Eso no funciona: un gasto mio repartido 100% a mi suma lo mismo
-- a lo que puse y a lo que me toca, asi que el saldo no se mueve, y de paso
-- infla el total del mes y la categoria "Otros".
--
-- Una liquidacion es otra cosa: plata que pasa de uno al otro. No es gasto,
-- no entra en ninguna categoria, y mueve el saldo de los dos a la vez.
--
-- Mismo patron que pagar_servicio: security definer con candado explicito.

create or replace function saldar_deuda(
  p_de          uuid,
  p_a           uuid,
  p_monto       numeric,
  p_fecha       date default current_date,
  p_client_uuid uuid default gen_random_uuid()
) returns liquidaciones
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fila liquidaciones;
begin
  if not es_de_la_casa() then
    raise exception 'Sin acceso';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;
  if p_de = p_a then
    raise exception 'Quien paga y quien recibe no pueden ser la misma persona';
  end if;
  if (select count(*) from usuarios where id in (p_de, p_a) and activo) <> 2 then
    raise exception 'Usuario no valido';
  end if;

  -- Idempotente: un reintento por mala señal devuelve la misma fila
  select * into fila from liquidaciones where client_uuid = p_client_uuid;
  if found then return fila; end if;

  insert into liquidaciones (client_uuid, de_usuario, a_usuario, monto, fecha, metodo)
  values (p_client_uuid, p_de, p_a, round(p_monto, 2), p_fecha, 'transferencia')
  returning * into fila;

  return fila;
end;
$$;

revoke all on function saldar_deuda(uuid, uuid, numeric, date, uuid) from public, anon;
grant execute on function saldar_deuda(uuid, uuid, numeric, date, uuid) to authenticated;
