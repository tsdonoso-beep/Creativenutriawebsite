// sheet-sync · vuelca todos los gastos al Google Sheet.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ensureRoot, getAccessToken, syncSheet } from './google.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

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
    const token = await getAccessToken(supa);
    const raiz = await ensureRoot(token, supa);
    const sheetId = await syncSheet(token, supa, raiz);
    return json({
      ok: true,
      sheet_id: sheetId,
      url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
    });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
