// Helpers de Google para LA NUTRIA APP.
// Auth con service account (JWT RS256 firmado aquí), carpetas y archivos en
// Drive, y sincronización del Sheet aprovechando la conversión CSV de Drive.
//
// Este archivo se copia dentro de cada función que lo necesita: Supabase
// despliega cada función como una unidad independiente.

export interface SA {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** Lee GOOGLE_SA_KEY y tolera las formas en que se suele pegar mal. */
export function getSA(): SA {
  const raw = Deno.env.get('GOOGLE_SA_KEY');
  if (!raw) throw new Error('Falta el secreto GOOGLE_SA_KEY.');
  let sa: SA;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SA_KEY no es JSON válido. Pega el archivo completo, de la { a la }.');
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('GOOGLE_SA_KEY no tiene client_email o private_key.');
  }
  // Si el JSON se pegó con los \n doblemente escapados, la clave llega literal.
  if (sa.private_key.includes('\\n')) {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }
  return sa;
}

function pemToBuf(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === 'string') bytes = new TextEncoder().encode(data);
  else bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Firma un JWT RS256 con la private key y lo cambia por un access_token. */
export async function getAccessToken(sa: SA): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud,
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBuf(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const res = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(sig)}`,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('Auth con Google falló: ' + JSON.stringify(j));
  return j.access_token as string;
}

export const H = (token: string) => ({ Authorization: `Bearer ${token}` });

const DRIVE_ARGS = 'supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives';

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
