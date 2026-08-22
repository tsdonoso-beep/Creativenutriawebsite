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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
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
