// google-oauth · conecta la cuenta de Google una sola vez.
//
// Google no deja que una service account escriba archivos en "Mi unidad", así
// que la app actúa en nombre del usuario. Este endpoint hace el baile de OAuth
// y guarda el refresh_token en configuracion (tabla que solo ve el service
// role). Así el token nunca pasa por el cliente ni por el portapapeles.
//
// verify_jwt está desactivado porque el navegador y Google llegan aquí sin
// cabeceras de Supabase. La protección es la setup key de un solo uso.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// El gateway de Supabase fuerza content-type: text/plain y una CSP de sandbox
// en las funciones sin verify_jwt, asi que no se puede servir HTML. Ademas
// descarta el charset, por lo que las respuestas van en ASCII puro: con tildes
// o emojis el navegador las interpreta como latin-1 y salen ilegibles.
const texto = (msg: string, ok = true) =>
  new Response(msg, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

Deno.serve(async (req) => {
  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const url = new URL(req.url);
  const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-oauth`;
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    return texto('Faltan credenciales.\n\nCarga GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET en los secretos de Supabase y vuelve a abrir este enlace.', false);
  }

  const { data: cfg } = await supa
    .from('configuracion').select('oauth_setup_key').eq('id', 1).single();
  const key = cfg?.oauth_setup_key;

  const err = url.searchParams.get('error');
  if (err) return texto(`Permiso denegado. Google respondio: ${err}\n\nVuelve a abrir el enlace y acepta el acceso.`, false);

  const code = url.searchParams.get('code');

  // Paso 1: arrancar el consentimiento
  if (!code) {
    const setup = url.searchParams.get('setup');
    if (!key || setup !== key) return texto('Enlace incorrecto: la setup key no coincide o ya fue usada.', false);

    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.searchParams.set('client_id', clientId);
    auth.searchParams.set('redirect_uri', redirectUri);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file');
    auth.searchParams.set('access_type', 'offline');
    auth.searchParams.set('prompt', 'consent'); // fuerza que devuelva refresh_token
    auth.searchParams.set('state', key);
    return Response.redirect(auth.toString(), 302);
  }

  // Paso 2: canjear el código por el refresh_token
  if (!key || url.searchParams.get('state') !== key) {
    return texto('El valor de state no coincide. Reinicia el proceso desde el enlace de setup.', false);
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const j = await res.json();
  if (!j.refresh_token) {
    return texto(
      'Google no entrego un refresh_token.\n\nRespuesta: ' + JSON.stringify(j).slice(0, 300) +
      '\n\nSi ya habias dado permiso antes, revoca el acceso en myaccount.google.com/permissions y vuelve a intentarlo.',
      false,
    );
  }

  // Se guarda y se quema la setup key: el enlace no vuelve a servir.
  await supa.from('configuracion').update({
    google_refresh_token: j.refresh_token,
    oauth_setup_key: null,
    actualizado_en: new Date().toISOString(),
  }).eq('id', 1);

  return texto('Listo. Google conectado.\n\nLA NUTRIA APP ya puede guardar las boletas en tu Drive.\nPuedes cerrar esta ventana.');
});
