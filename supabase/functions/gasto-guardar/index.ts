// gasto-guardar · registra un gasto (con foto opcional) de forma idempotente.
// La foto queda en Storage; el empujón a Drive lo hace gasto-a-drive.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

function bytesFromBase64(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64; // tolera data: URIs
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

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
  try {
    const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
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
  try {
    const veto = sinSesion(req);
    if (veto) return json({ error: veto }, 401);

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const b = await req.json();

    const client_uuid = b.client_uuid;
    if (!client_uuid) return json({ error: 'Falta client_uuid.' }, 400);

    // Idempotencia: si la cola offline reintenta tras un timeout, no duplicamos.
    const { data: ya } = await supa
      .from('gastos').select('id, drive_estado')
      .eq('client_uuid', client_uuid).maybeSingle();
    if (ya) return json({ ok: true, id: ya.id, drive_estado: ya.drive_estado, duplicado: true });

    if (!b.registrado_por || !b.pagado_por) {
      return json({ error: 'Falta registrado_por o pagado_por.' }, 400);
    }
    const monto = Number(b.monto);
    if (!Number.isFinite(monto) || monto <= 0) return json({ error: 'Monto inválido.' }, 400);

    const reparto_tipo = b.reparto_tipo || 'default';
    if (!['default', 'igual', 'personal', 'custom'].includes(reparto_tipo)) {
      return json({ error: 'reparto_tipo inválido.' }, 400);
    }

    const moneda = b.moneda === 'USD' ? 'USD' : 'PEN';
    const tipo_cambio = moneda === 'USD' ? Number(b.tipo_cambio || 0) : 1;
    if (moneda === 'USD' && !(tipo_cambio > 0)) {
      return json({ error: 'Falta tipo_cambio para un gasto en USD.' }, 400);
    }

    const fecha_gasto = b.fecha_gasto || new Date().toISOString().slice(0, 10);

    // Foto → Storage (privado). Si Drive falla después, la boleta sigue aquí.
    let imagen_path: string | null = null;
    let mime: string | null = null;
    if (b.foto?.base64) {
      mime = b.foto.mime || 'image/jpeg';
      const bytes = bytesFromBase64(b.foto.base64);
      imagen_path = `${fecha_gasto.slice(0, 7)}/${client_uuid}.${extFromMime(mime!)}`;
      const up = await supa.storage.from('boletas')
        .upload(imagen_path, bytes, { contentType: mime!, upsert: true });
      if (up.error) return json({ error: 'No se pudo guardar la foto: ' + up.error.message }, 500);
    }

    const { data: g, error } = await supa.from('gastos').insert({
      client_uuid,
      registrado_por: b.registrado_por,
      pagado_por: b.pagado_por,
      categoria_id: b.categoria_id ?? null,
      monto,
      moneda,
      tipo_cambio,
      comercio: b.comercio ?? null,
      descripcion: b.descripcion ?? null,
      fecha_gasto,
      metodo_pago: b.metodo_pago ?? null,
      reparto_tipo,
      imagen_path,
      mime,
      drive_estado: imagen_path ? 'pendiente' : 'sin_foto',
    }).select('id, monto_pen, drive_estado').single();

    if (error) return json({ error: error.message }, 400);

    // Reparto explícito: el trigger no lo toca cuando es 'custom'.
    if (reparto_tipo === 'custom') {
      const parts = Array.isArray(b.participaciones) ? b.participaciones : [];
      const suma = parts.reduce((a: number, p: any) => a + Number(p.porcentaje || 0), 0);
      if (Math.abs(suma - 100) > 0.01) {
        await supa.from('gastos').delete().eq('id', g.id);
        return json({ error: `Los porcentajes suman ${suma}, deben sumar 100.` }, 400);
      }
      const filas = parts.map((p: any) => ({
        gasto_id: g.id,
        usuario_id: p.usuario_id,
        porcentaje: Number(p.porcentaje),
        monto_asignado: Math.round(Number(g.monto_pen) * Number(p.porcentaje)) / 100,
      }));
      const ins = await supa.from('gasto_participaciones').insert(filas);
      if (ins.error) {
        await supa.from('gastos').delete().eq('id', g.id);
        return json({ error: 'Reparto inválido: ' + ins.error.message }, 400);
      }
    }

    return json({ ok: true, id: g.id, monto_pen: g.monto_pen, drive_estado: g.drive_estado });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
