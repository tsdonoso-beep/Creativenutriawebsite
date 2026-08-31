// recibo-guardar · guarda el comprobante de un servicio en Storage y lo sube
// a Drive, dentro de "Servicios/2026-08".
//
// A diferencia de las boletas de gasto, esto no pasa por la cola offline: los
// recibos se suben en casa, con wifi, no en la caja del supermercado. Aun asi
// Storage va primero, para que un fallo de Drive no pierda el archivo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ensureFolder, ensureRoot, getAccessToken, sani, uploadFile } from './google.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

function sinSesion(req: Request): string | null {
  try {
    const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const cuerpo = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const relleno = cuerpo + '='.repeat((4 - cuerpo.length % 4) % 4);
    return JSON.parse(atob(relleno)).role === 'anon' ? 'Necesitas iniciar sesion.' : null;
  } catch {
    return 'Falta la sesion.';
  }
}

const extDe = (m: string) =>
  m.includes('pdf') ? 'pdf'
  : m.includes('png') ? 'png'
  : m.includes('webp') ? 'webp'
  : m.includes('heic') ? 'heic'
  : 'jpg';

function bytesDe(b64: string): Uint8Array {
  const limpio = b64.includes(',') ? b64.split(',')[1] : b64;
  const bin = atob(limpio);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const veto = sinSesion(req);
  if (veto) return json({ error: veto }, 401);

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let pago: any = null;
  try {
    const b = await req.json();
    if (!b.pago_id) return json({ error: 'Falta el pago.' }, 400);

    const r = await supa.from('servicio_pagos').select('*').eq('id', b.pago_id).single();
    pago = r.data;
    if (!pago) return json({ error: 'Pago no encontrado.' }, 404);

    const { data: serv } = await supa
      .from('servicios').select('nombre, proveedor').eq('id', pago.servicio_id).single();

    let mime: string;
    let ext: string;
    let bytes: Uint8Array;
    let ruta: string;

    if (b.archivo?.base64) {
      // Subida normal: llega el archivo desde el telefono
      mime = b.archivo.mime || 'application/pdf';
      ext = extDe(mime);
      bytes = bytesDe(b.archivo.base64);
      ruta = `servicios/${pago.periodo}/${pago.id}.${ext}`;

      // Storage primero: si Drive falla, el comprobante no se pierde
      const up = await supa.storage.from('boletas')
        .upload(ruta, bytes, { contentType: mime, upsert: true });
      if (up.error) return json({ error: 'No se pudo guardar el archivo: ' + up.error.message }, 500);

      const cambios: Record<string, unknown> = {
        comprobante_path: ruta, mime, drive_estado: 'pendiente',
      };
      if (b.ocr) {
        cambios.ocr_json = b.ocr;
        cambios.confianza_ocr = b.ocr.confianza ?? null;
        if (b.ocr.consumo != null) {
          cambios.consumo = b.ocr.consumo;
          cambios.unidad_consumo = b.ocr.unidad_consumo ?? null;
        }
      }
      await supa.from('servicio_pagos').update(cambios).eq('id', pago.id);
    } else {
      // Reintento: el archivo ya vive en Storage de un intento anterior
      if (!pago.comprobante_path) {
        return json({ error: 'Ese pago no tiene comprobante guardado.' }, 400);
      }
      ruta = pago.comprobante_path;
      mime = pago.mime || 'application/pdf';
      ext = extDe(mime);
      const dl = await supa.storage.from('boletas').download(ruta);
      if (dl.error || !dl.data) throw new Error('No se pudo leer el comprobante de Storage.');
      bytes = new Uint8Array(await dl.data.arrayBuffer());
    }

    // Y ahora a Drive, en su propia rama del arbol
    const token = await getAccessToken(supa);
    const raiz = await ensureRoot(token, supa);
    const carpetaServicios = await ensureFolder(token, 'Servicios', raiz);
    const carpetaMes = await ensureFolder(token, pago.periodo, carpetaServicios);

    const monto = pago.monto != null ? `_S-${Number(pago.monto).toFixed(2)}` : '';
    const nombre = `${pago.periodo}_${sani(serv?.nombre || 'servicio', 30)}${monto}.${ext}`;

    const subido = await uploadFile(token, nombre, mime, bytes, carpetaMes);

    await supa.from('servicio_pagos').update({
      drive_file_id: subido.id,
      drive_url: subido.url,
      drive_estado: 'subido',
      drive_error: null,
    }).eq('id', pago.id);

    return json({ ok: true, drive_url: subido.url, archivo: nombre, carpeta: pago.periodo });
  } catch (e) {
    const msg = String((e as any)?.message || e);
    if (pago?.id) {
      await supa.from('servicio_pagos').update({
        drive_estado: 'error',
        drive_error: msg.slice(0, 500),
        drive_intentos: (pago.drive_intentos || 0) + 1,
      }).eq('id', pago.id);
    }
    // El archivo ya esta en Storage, asi que esto no es una perdida
    return json({ error: msg, guardado_en_storage: true }, 500);
  }
});
