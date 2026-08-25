// Helpers de Google para LA NUTRIA APP.
//
// Actuamos en nombre del usuario con un refresh_token (OAuth), no con una
// service account: Google no permite que una service account escriba archivos
// en "Mi unidad" porque no tiene cuota propia.
//
// El scope es drive.file, que solo da acceso a lo que la app crea. Nunca ve el
// resto del Drive.
//
// Este archivo se copia dentro de cada función que lo necesita: Supabase
// despliega cada función como una unidad independiente.

/** Cambia el refresh_token guardado por un access_token fresco. */
export async function getAccessToken(supa: any): Promise<string> {
  const { data } = await supa
    .from('configuracion').select('google_refresh_token').eq('id', 1).single();
  const refresh = data?.google_refresh_token;
  if (!refresh) {
    throw new Error('Google no está conectado. Abre una vez la URL de setup de google-oauth.');
  }
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('Faltan GOOGLE_OAUTH_CLIENT_ID o GOOGLE_OAUTH_CLIENT_SECRET.');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const j = await res.json();
  if (!j.access_token) {
    throw new Error('No se pudo refrescar el token de Google: ' + JSON.stringify(j));
  }
  return j.access_token as string;
}

export const H = (token: string) => ({ Authorization: `Bearer ${token}` });

const DRIVE_ARGS = 'supportsAllDrives=true&includeItemsFromAllDrives=true';

async function findFolder(token: string, name: string, parent: string): Promise<string | null> {
  const q = `'${parent}' in parents and name='${name.replace(/'/g, "\\'")}' ` +
    `and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&${DRIVE_ARGS}`,
    { headers: H(token) },
  );
  const j = await res.json();
  return j.files && j.files[0] ? j.files[0].id : null;
}

async function createFolder(token: string, name: string, parent: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id', {
    method: 'POST',
    headers: { ...H(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parents: [parent], mimeType: 'application/vnd.google-apps.folder' }),
  });
  const j = await res.json();
  if (!j.id) throw new Error(`No se pudo crear la carpeta ${name}: ` + JSON.stringify(j));
  return j.id;
}

/** Devuelve el ID de la carpeta, creándola si no existe. */
export async function ensureFolder(token: string, name: string, parent: string): Promise<string> {
  return (await findFolder(token, name, parent)) || (await createFolder(token, name, parent));
}

/**
 * Carpeta raíz de la app. Con scope drive.file no podemos ver carpetas creadas
 * a mano, así que la app crea la suya y guarda el ID.
 */
export async function ensureRoot(token: string, supa: any): Promise<string> {
  const { data } = await supa
    .from('configuracion').select('drive_root_folder_id').eq('id', 1).single();
  if (data?.drive_root_folder_id) return data.drive_root_folder_id;
  const id = await ensureFolder(token, 'LA NUTRIA APP', 'root');
  await supa.from('configuracion').update({ drive_root_folder_id: id }).eq('id', 1);
  return id;
}

export async function uploadFile(
  token: string,
  name: string,
  mime: string,
  bytes: Uint8Array,
  parent: string,
): Promise<{ id: string; url: string }> {
  const boundary = 'nutria' + crypto.randomUUID();
  const enc = new TextEncoder();
  const meta = JSON.stringify({ name, parents: [parent] });
  const pre = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const post = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(pre.length + bytes.length + post.length);
  body.set(pre, 0);
  body.set(bytes, pre.length);
  body.set(post, pre.length + bytes.length);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink',
    {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const j = await res.json();
  if (!j.id) throw new Error('Error subiendo a Drive: ' + JSON.stringify(j));
  return { id: j.id as string, url: (j.webViewLink as string) || `https://drive.google.com/file/d/${j.id}/view` };
}

/** Quita tildes y caracteres que ensucian los nombres de archivo. */
export function sani(s: unknown, max = 40): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || 'sin-dato';
}

// ---------------------------------------------------------------------------
// Sheet: se arma un CSV y Drive lo convierte en hoja de cálculo. Así no hace
// falta la API de Sheets ni un scope adicional.
// ---------------------------------------------------------------------------

const Q = String.fromCharCode(34);
const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return Q + s.split(Q).join(Q + Q) + Q;
};

export function buildCsv(gastos: any[]): string {
  const head = [
    'Fecha', 'Periodo', 'Categoría', 'Comercio', 'Descripción', 'Monto', 'Moneda',
    'Monto PEN', 'Pagó', 'Registró', 'Método de pago', 'Reparto', 'Boleta',
  ];
  const lines = [head.map(csvCell).join(',')];
  for (const g of gastos) {
    lines.push([
      g.fecha_gasto || '',
      g.periodo || '',
      g.categoria || '',
      g.comercio || '',
      g.descripcion || '',
      g.monto == null ? '' : g.monto,
      g.moneda || '',
      g.monto_pen == null ? '' : g.monto_pen,
      g.pagado_por_nombre || '',
      g.registrado_por_nombre || '',
      g.metodo_pago || '',
      g.reparto_tipo || '',
      g.drive_url || '',
    ].map(csvCell).join(','));
  }
  // BOM para que Sheets respete las tildes
  return '﻿' + lines.join('\n');
}

async function createSheet(token: string, name: string, parent: string, csv: string): Promise<string> {
  const boundary = 'nutria' + crypto.randomUUID();
  const enc = new TextEncoder();
  const meta = JSON.stringify({
    name,
    parents: [parent],
    mimeType: 'application/vnd.google-apps.spreadsheet',
  });
  const pre = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: text/csv; charset=UTF-8\r\n\r\n`,
  );
  const post = enc.encode(`\r\n--${boundary}--`);
  const cb = enc.encode(csv);
  const body = new Uint8Array(pre.length + cb.length + post.length);
  body.set(pre, 0);
  body.set(cb, pre.length);
  body.set(post, pre.length + cb.length);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
    {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const j = await res.json();
  if (!j.id) throw new Error('No se pudo crear la hoja: ' + JSON.stringify(j));
  return j.id;
}

async function updateSheet(token: string, id: string, csv: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: { ...H(token), 'Content-Type': 'text/csv; charset=UTF-8' },
      body: csv,
    },
  );
  if (!res.ok) {
    throw new Error('No se pudo actualizar la hoja: ' + res.status + ' ' + (await res.text()).slice(0, 200));
  }
}

/** Vuelca todos los gastos al Sheet, creándolo la primera vez. */
export async function syncSheet(token: string, supa: any, parentFolder: string): Promise<string> {
  const [gRes, cRes] = await Promise.all([
    supa.from('v_gastos_detalle').select('*').order('fecha_gasto', { ascending: false }),
    supa.from('configuracion').select('sheet_id').eq('id', 1).single(),
  ]);
  const csv = buildCsv(gRes.data || []);
  let sid = cRes.data?.sheet_id as string | null;
  if (!sid) {
    sid = await createSheet(token, 'Gastos - LA NUTRIA APP', parentFolder, csv);
    await supa.from('configuracion').update({ sheet_id: sid }).eq('id', 1);
  } else {
    await updateSheet(token, sid, csv);
  }
  return sid;
}
