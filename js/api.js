// Cliente REST a mano. Es poco código y evita depender de un CDN, que en una
// app offline-first sería justo lo que falla cuando más la necesitas.
import { URL_SUPA, ANON } from './config.js';

const cabeceras = (extra = {}) => ({
  apikey: ANON,
  Authorization: `Bearer ${ANON}`,
  'Content-Type': 'application/json',
  ...extra,
});

export async function rest(ruta, opciones = {}) {
  const r = await fetch(`${URL_SUPA}/rest/v1/${ruta}`, {
    ...opciones,
    headers: cabeceras(opciones.headers),
  });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 180)}`);
  return r.status === 204 ? null : r.json();
}

export async function fn(nombre, cuerpo) {
  const r = await fetch(`${URL_SUPA}/functions/v1/${nombre}`, {
    method: 'POST',
    headers: cabeceras(),
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

export const crearTarea = (tarea) =>
  rest('tareas', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(tarea),
  });
