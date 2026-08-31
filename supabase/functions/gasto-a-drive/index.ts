// gasto-a-drive · sube la boleta de un gasto a Drive y refresca el Sheet.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ensureFolder, ensureRoot, getAccessToken, sani, syncSheet, uploadFile } from './google.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const extFromMime = (m: string) =>
  m.includes('png') ? 'png'
  : m.includes('webp') ? 'webp'
  : m.includes('heic') ? 'heic'
  : m.includes('pdf') ? 'pdf'
  : 'jpg';

/**
 * Rechaza a quien llega solo con la anon key. Por dentro estas funciones usan
 * el service role, asi que RLS no las frena: el filtro tiene que estar aqui.
 * El JWT ya lo verifico el gateway; aqui solo se lee que rol trae.
 */
function sinSesion(req: Request): string | null {
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  // Las funciones se llaman entre si con la clave de servicio. Esa clave no
  // siempre es un JWT, asi que se compara directo antes de intentar leerla
  // como token: sin esto, la guardia rompe los reintentos internos.
  if (t && t === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return null;
  try {
    const cuerpo = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const relleno = cuerpo + '='.repeat((4 - cuerpo.length % 4) % 4);
    const rol = JSON.parse(atob(relleno)).role;
    return rol === 'anon' ? 'Necesitas iniciar sesion.' : null;
  } catch {
    return 'Falta la sesion.';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const veto = sinSesion(req);
  if (veto) return json({ error: veto }, 401);

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let g: any = null;
  try {
    const { gasto_id } = await req.json();
    if (!gasto_id) return json({ error: 'Falta gasto_id.' }, 400);

    const r = await supa.from('gastos').select('*').eq('id', gasto_id).single();
    g = r.data;
    if (!g) return json({ error: 'Gasto no encontrado.' }, 404);
    if (!g.imagen_path) return json({ error: 'El gasto no tiene foto.' }, 400);
    if (g.drive_file_id) return json({ ok: true, drive_url: g.drive_url, ya_estaba: true });

    const token = await getAccessToken(supa);

    // Carpeta del mes dentro de la carpeta raíz que crea la propia app
    const raiz = await ensureRoot(token, supa);
    const carpetaMes = await ensureFolder(token, g.periodo, raiz);

    const dl = await supa.storage.from('boletas').download(g.imagen_path);
    if (dl.error || !dl.data) throw new Error('No se pudo leer la foto de Storage.');
    const bytes = new Uint8Array(await dl.data.arrayBuffer());

    // FECHA_COMERCIO_MONTO.ext
    const simbolo = g.moneda === 'USD' ? 'USD' : 'S';
    const nombre = `${g.fecha_gasto}_${sani(g.comercio || 'gasto', 30)}_` +
      `${simbolo}-${Number(g.monto).toFixed(2)}.${extFromMime(g.mime || 'image/jpeg')}`;

    const up = await uploadFile(token, nombre, g.mime || 'image/jpeg', bytes, carpetaMes);

    await supa.from('gastos').update({
      drive_file_id: up.id,
      drive_url: up.url,
      drive_estado: 'subido',
      drive_error: null,
    }).eq('id', g.id);

    // El Sheet es best-effort: que falle no invalida la subida de la boleta.
    try {
      await syncSheet(token, supa, raiz);
    } catch (e) {
      console.error('sheet sync:', String(e));
    }

    return json({ ok: true, drive_url: up.url, archivo: nombre, carpeta: g.periodo });
  } catch (e) {
    const msg = String((e as any)?.message || e);
    if (g?.id) {
      await supa.from('gastos').update({
        drive_estado: 'error',
        drive_error: msg.slice(0, 500),
        drive_intentos: (g.drive_intentos || 0) + 1,
      }).eq('id', g.id);
    }
    return json({ error: msg }, 500);
  }
});
