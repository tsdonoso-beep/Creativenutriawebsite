// drive-reintentos · barre las boletas que no llegaron a Drive y reintenta.
// Pensada para un cron; también sirve para dispararla a mano.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const MAX_INTENTOS = 5;

/** Rechaza a quien llega solo con la anon key. */
function sinSesion(req: Request): string | null {
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  // Las funciones se llaman entre si con la clave de servicio. Esa clave no
  // siempre es un JWT, asi que se compara directo antes de intentar leerla
  // como token: sin esto, la guardia rompe los reintentos internos.
  if (t && t === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return null;
  try {
    const cuerpo = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const relleno = cuerpo + '='.repeat((4 - cuerpo.length % 4) % 4);
    return JSON.parse(atob(relleno)).role === 'anon' ? 'Necesitas iniciar sesion.' : null;
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

    const { data: pendientes } = await supa
      .from('gastos').select('id')
      .in('drive_estado', ['pendiente', 'error'])
      .not('imagen_path', 'is', null)
      .lt('drive_intentos', MAX_INTENTOS)
      .order('fecha_registro', { ascending: true })
      .limit(20);

    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/gasto-a-drive`;
    const auth = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

    let subidos = 0;
    const fallidos: string[] = [];
    for (const g of pendientes || []) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth },
          body: JSON.stringify({ gasto_id: g.id }),
        });
        const r = await res.json();
        if (r.ok) subidos++;
        else fallidos.push(g.id);
      } catch {
        fallidos.push(g.id);
      }
    }

    // Los recibos de servicios tambien se quedaban colgados: antes esta
    // funcion solo miraba los gastos, asi que un recibo que no llegaba a
    // Drive no lo reintentaba nadie.
    const { data: recibos } = await supa
      .from('servicio_pagos').select('id')
      .in('drive_estado', ['pendiente', 'error'])
      .not('comprobante_path', 'is', null)
      .lt('drive_intentos', MAX_INTENTOS)
      .limit(20);

    const urlRecibo = `${Deno.env.get('SUPABASE_URL')}/functions/v1/recibo-guardar`;
    let recibosSubidos = 0;
    for (const p of recibos || []) {
      try {
        const res = await fetch(urlRecibo, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth },
          body: JSON.stringify({ pago_id: p.id }),
        });
        const r = await res.json();
        if (r.ok) recibosSubidos++;
        else fallidos.push(p.id);
      } catch {
        fallidos.push(p.id);
      }
    }

    return json({
      ok: true,
      revisados: (pendientes || []).length + (recibos || []).length,
      subidos, recibos_subidos: recibosSubidos, fallidos,
    });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
