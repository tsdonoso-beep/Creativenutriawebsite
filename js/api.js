// Cliente REST a mano. Es poco código y evita depender de un CDN, que en una
// app offline-first sería justo lo que falla cuando más la necesitas.
//
// Desde que la app vive en la web, la anon key ya no abre nada: las políticas
// exigen una sesión iniciada. La anon key solo sirve como llave de la puerta
// de entrada (el endpoint de auth).
import { URL_SUPA, ANON } from './config.js';

const CLAVE_SESION = 'nutria_sesion';
let sesion = null;
try { sesion = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); } catch { /* nada */ }

export const haySesion = () => !!sesion?.refresh_token;

function guardar(j) {
  sesion = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    // expires_at viene en segundos; si falta, se asume una hora
    expira: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
  };
  localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
}

export async function entrar(email, password) {
  const r = await fetch(`${URL_SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const j = await r.json();
  if (!j.access_token) {
    throw new Error(j.error_description || j.msg || j.message || 'Correo o contraseña incorrectos');
  }
  guardar(j);
}

export function salir() {
  sesion = null;
  localStorage.removeItem(CLAVE_SESION);
}

async function refrescar() {
  const r = await fetch(`${URL_SUPA}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: sesion.refresh_token }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('sesión vencida');
  guardar(j);
}

/**
 * Devuelve un token válido. Si el refresco falla por falta de red, se entrega
 * el que había: sin señal da igual que esté vencido, y evita cerrar la sesión
 * de alguien que solo está en el ascensor.
 */
async function token() {
  if (!sesion) return ANON;
  if (Math.floor(Date.now() / 1000) > sesion.expira - 60) {
    try { await refrescar(); } catch { /* se sigue con el viejo */ }
  }
  return sesion.access_token;
}

const cabeceras = async (extra = {}) => ({
  apikey: ANON,
  Authorization: `Bearer ${await token()}`,
  'Content-Type': 'application/json',
  ...extra,
});

export async function rest(ruta, opciones = {}) {
  const r = await fetch(`${URL_SUPA}/rest/v1/${ruta}`, {
    ...opciones,
    headers: await cabeceras(opciones.headers),
  });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 180)}`);
  return r.status === 204 ? null : r.json();
}

export async function fn(nombre, cuerpo) {
  const r = await fetch(`${URL_SUPA}/functions/v1/${nombre}`, {
    method: 'POST',
    headers: await cabeceras(),
    body: JSON.stringify(cuerpo ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

const rpc = (nombre, args) =>
  rest(`rpc/${nombre}`, { method: 'POST', body: JSON.stringify(args) });

// ---------- Lecturas ----------

export const traerUsuarios = () =>
  rest('usuarios?activo=eq.true&order=orden&select=id,nombre,emoji,color,porcentaje_default');

export const traerCategorias = () =>
  rest('categorias?activo=eq.true&order=orden&select=id,nombre,emoji');

export const traerGastos = (periodo, limite = 60) =>
  rest(`v_gastos_detalle?periodo=eq.${periodo}&order=fecha_gasto.desc,fecha_registro.desc&limit=${limite}`);

export const traerBalance = () => rest('v_balance?order=nombre');

export const traerResumenMes = (periodo) =>
  rest(`v_resumen_mensual?periodo=eq.${periodo}&order=total_pen.desc`);

export const traerTotalMes = (periodo) =>
  rest(`v_resumen_periodo?periodo=eq.${periodo}`);

export const traerLista = () =>
  rest('lista_items?order=comprado.asc,orden.asc,creado_en.asc');

export const traerTareas = () =>
  rest('v_tareas_pendientes?order=proxima_fecha.asc,orden.asc');

export const traerTipos = () =>
  rest('tipos?activo=eq.true&order=orden&select=id,nombre,descripcion,reparto_default,color');

/** Los servicios del periodo, ya ordenados por urgencia de pago. */
export const traerServicios = (periodo) =>
  rest(`v_servicios?periodo=eq.${periodo}&order=fecha_vencimiento.asc`);

// ---------- Escrituras ----------

export const guardarGasto = (payload) => fn('gasto-guardar', payload);
export const subirBoleta   = (gasto_id) => fn('gasto-a-drive', { gasto_id });
export const leerBoleta    = (foto) => fn('boleta-leer', { foto });
export const sincronizarHoja = () => fn('sheet-sync', {});

export const agregarItem = (item) =>
  rest('lista_items', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(item),
  });

export const cambiarItem = (id, cambios) =>
  rest(`lista_items?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(cambios),
  });

export const borrarItem = (id) =>
  rest(`lista_items?id=eq.${id}`, { method: 'DELETE' });

export const borrarComprados = () =>
  rest('lista_items?comprado=eq.true', { method: 'DELETE' });

export const completarTarea = (p_tarea_id, p_usuario_id) =>
  rpc('completar_tarea', { p_tarea_id, p_usuario_id });

export const leerRecibo = (archivo) => fn('recibo-leer', { archivo });

export const guardarRecibo = (pago_id, archivo, ocr) =>
  fn('recibo-guardar', { pago_id, archivo, ocr });

export const generarPagos = (p_periodo) => rpc('generar_pagos_mes', { p_periodo });

export const pagarServicio = (p_pago_id, p_usuario_id, p_monto, p_fecha, p_pagado_por) =>
  rpc('pagar_servicio', { p_pago_id, p_usuario_id, p_monto, p_fecha, p_pagado_por });

export const guardarComprobante = (pago_id, cambios) =>
  rest(`servicio_pagos?id=eq.${pago_id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(cambios),
  });

export const crearServicio = (servicio) =>
  rest('servicios', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(servicio),
  });

export const actualizarServicio = (id, cambios) =>
  rest(`servicios?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(cambios),
  });

export const crearTarea = (tarea) =>
  rest('tareas', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(tarea),
  });
