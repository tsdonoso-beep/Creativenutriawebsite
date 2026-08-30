-- pagar_servicio crea un gasto, pero gastos solo tiene politica de lectura:
-- las escrituras estaban reservadas al service role de las Edge Functions.
-- Como la funcion corria con los permisos de quien la llama, RLS le bloqueaba
-- el insert y el pago fallaba con "No se pudo registrar el pago".
--
-- Se resuelve dandole permisos propios (security definer) con un candado
-- explicito: sigue siendo la unica via para escribir en gastos desde el
-- cliente, y solo la abre quien esta en la lista de la casa.

create or replace function pagar_servicio(
  p_pago_id     uuid,
  p_usuario_id  uuid,
  p_monto       numeric default null,
  p_fecha       date default current_date,
  p_pagado_por  uuid default null
) returns servicio_pagos
language plpgsql
security definer
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
  -- El candado: security definer sin esto seria una puerta abierta
  if not es_de_la_casa() then
    raise exception 'Sin acceso';
  end if;

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

revoke all on function pagar_servicio(uuid, uuid, numeric, date, uuid) from public;
grant execute on function pagar_servicio(uuid, uuid, numeric, date, uuid) to authenticated;

revoke all on function generar_pagos_mes(text) from public;
grant execute on function generar_pagos_mes(text) to authenticated;

revoke all on function completar_tarea(uuid, uuid) from public;
grant execute on function completar_tarea(uuid, uuid) to authenticated;
