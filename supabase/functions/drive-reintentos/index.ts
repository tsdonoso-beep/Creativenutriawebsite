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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
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

    return json({ ok: true, revisados: (pendientes || []).length, subidos, fallidos });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
