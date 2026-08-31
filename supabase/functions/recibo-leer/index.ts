// recibo-leer · lee un recibo de servicio (PDF o foto) con Gemini.
//
// Calibrado contra un recibo real de PLUZ Energia, que trae tres numeros que
// parecen el total y solo uno lo es:
//   SUBTOTAL Mes Actual   42.51
//   TOTAL Mes Actual      50.16
//   TOTAL A PAGAR         51.00  <- este
// La diferencia son el Aporte Ley 28749 y el redondeo del mes anterior. Un
// lector ingenuo agarra el 50.16 y descuadra el balance todos los meses.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const MODELO = Deno.env.get('GEMINI_MODEL') || 'gemini-3.1-flash-lite-preview';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

function obtenerClaves(): string[] {
  const nombres = [
    'GEMINI_API_KEY', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3',
    'GEMINI_API_KEY_4', 'GEMINI_API_KEY_5',
  ];
  const vistas = new Set<string>();
  const claves: string[] = [];
  for (const n of nombres) {
    for (const k of (Deno.env.get(n) || '').split(',').map((x) => x.trim()).filter(Boolean)) {
      if (!vistas.has(k)) { vistas.add(k); claves.push(k); }
    }
  }
  return claves;
}

const ES_CUOTA = /quota|rate.?limit|RESOURCE_EXHAUSTED|exhausted|too many requests/i;

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

const esquema = {
  type: 'OBJECT',
  properties: {
    proveedor:         { type: 'STRING', description: 'Empresa que emite el recibo' },
    numero_suministro: { type: 'STRING', description: 'Numero de suministro o de cliente, solo digitos' },
    numero_recibo:     { type: 'STRING' },
    periodo:           { type: 'STRING', description: 'Mes que factura, formato YYYY-MM' },
    fecha_emision:     { type: 'STRING', description: 'YYYY-MM-DD' },
    fecha_vencimiento: { type: 'STRING', description: 'YYYY-MM-DD' },
    monto_total:       { type: 'NUMBER', description: 'El TOTAL A PAGAR' },
    moneda:            { type: 'STRING', description: 'PEN o USD' },
    consumo:           { type: 'NUMBER', description: 'Consumo del periodo, solo el numero' },
    unidad_consumo:    { type: 'STRING', description: 'kWh, m3, GB u otra' },
    confianza:         { type: 'NUMBER', description: 'Entre 0 y 1' },
    notas:             { type: 'STRING', description: 'Que no se pudo leer, si algo' },
  },
  required: ['monto_total', 'confianza'],
};

const PROMPT = `Eres un lector de recibos de servicios peruanos: luz, agua, gas, internet, telefonia, mantenimiento y alquiler.

Reglas, en orden de importancia:

1. monto_total es el "TOTAL A PAGAR", el importe final que hay que abonar.
   NO es el "SUBTOTAL", NO es el "TOTAL Mes Actual" y NO es el IGV. Muchos
   recibos muestran un total intermedio antes de sumar aportes de ley o el
   redondeo del mes anterior; el correcto es el que dice TOTAL A PAGAR.
2. El monto puede venir enmascarado con asteriscos, como "S/*******51.00".
   Ignora los asteriscos y devuelve solo el numero: 51.00.
3. fecha_vencimiento es la fecha limite de pago, la que dice VENCIMIENTO.
   NO la confundas con EMISION ni con FECHA DE CORTE. Los meses suelen venir
   abreviados en espanol y en mayuscula: ENE FEB MAR ABR MAY JUN JUL AGO SET
   SEP OCT NOV DIC. "29/AGO/2026" es 2026-08-29.
4. numero_suministro identifica el servicio: puede llamarse "Numero de
   suministro", "Suministro", "Numero de cliente" o "Codigo de cliente".
   Devuelve solo los digitos.
5. proveedor es la empresa que cobra (PLUZ, Enel, Calidda, Sedapal, Movistar,
   Claro, Win). NO es el titular del recibo, que muchas veces es el dueno del
   departamento o una inmobiliaria.
6. consumo es lo consumido en el periodo, con su unidad: kWh en luz, m3 en
   agua o gas. Si el recibo no lo trae, omitelo.
7. periodo es el mes que se esta facturando, en formato YYYY-MM.
8. Si un dato no se puede leer, omitelo en vez de inventarlo, y dilo en notas.
   Baja la confianza si el documento esta borroso, torcido o cortado.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const veto = sinSesion(req);
    if (veto) return json({ error: veto }, 401);

    const claves = obtenerClaves();
    if (!claves.length) return json({ error: 'No hay ninguna GEMINI_API_KEY cargada.' }, 400);

    const b = await req.json().catch(() => ({}));
    if (!b.archivo?.base64) return json({ error: 'Falta el archivo del recibo.' }, 400);

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const datos64 = b.archivo.base64.includes(',')
      ? b.archivo.base64.split(',')[1]
      : b.archivo.base64;

    const cuerpo = JSON.stringify({
      contents: [{
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: b.archivo.mime || 'application/pdf', data: datos64 } },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: esquema,
        temperature: 0,
      },
    });

    const arranque = Math.floor(Math.random() * claves.length);
    let j: any = null;
    let usada = 0;
    let ultimoError = '';

    for (let i = 0; i < claves.length; i++) {
      usada = (arranque + i) % claves.length;
      const r = await fetch(`${BASE}/models/${MODELO}:generateContent?key=${claves[usada]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: cuerpo,
      });
      j = await r.json();
      if (!j.error) break;
      ultimoError = j.error.message || '';
      if (!(r.status === 429 || ES_CUOTA.test(ultimoError))) {
        return json({ error: 'Gemini: ' + ultimoError, modelo: MODELO }, 502);
      }
      j = null;
    }
    if (!j) return json({ error: 'Todas las claves estan al limite. ' + ultimoError }, 429);

    const texto = j.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) return json({ error: 'Gemini no devolvio contenido.' }, 502);

    let datos: any;
    try { datos = JSON.parse(texto); }
    catch { return json({ error: 'Gemini devolvio algo que no es JSON.', texto }, 502); }

    // Red de seguridad: si el numero llega con asteriscos o comas, se limpia
    if (typeof datos.monto_total === 'string') {
      datos.monto_total = Number(String(datos.monto_total).replace(/[^\d.]/g, ''));
    }

    // Con el numero de suministro sabemos de que servicio es sin preguntar
    let servicio: any = null;
    let pago: any = null;
    if (datos.numero_suministro) {
      const soloDigitos = String(datos.numero_suministro).replace(/\D/g, '');
      const { data } = await supa
        .from('servicios').select('id, nombre, categoria_id')
        .eq('numero_suministro', soloDigitos).maybeSingle();
      servicio = data ?? null;
    }
    // Si no, se intenta por el nombre del proveedor
    if (!servicio && datos.proveedor) {
      const { data } = await supa
        .from('servicios').select('id, nombre, categoria_id')
        .ilike('proveedor', `%${String(datos.proveedor).split(' ')[0]}%`).maybeSingle();
      servicio = data ?? null;
    }

    // Y con el periodo, de que mes
    if (servicio && datos.periodo) {
      const { data } = await supa
        .from('servicio_pagos').select('id, periodo, estado')
        .eq('servicio_id', servicio.id).eq('periodo', datos.periodo).maybeSingle();
      pago = data ?? null;
    }

    return json({
      ok: true,
      modelo: MODELO,
      clave: `${usada + 1}/${claves.length}`,
      datos,
      servicio,
      pago,
    });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
