// boleta-leer · lee una boleta con Gemini y devuelve los campos para
// precargar el formulario. No guarda el gasto: el usuario revisa y confirma.
//
// La API key vive en el secreto GEMINI_API_KEY y nunca sale del servidor.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// Modelo por defecto, ajustable sin redesplegar
const MODELO = Deno.env.get('GEMINI_MODEL') || 'gemini-3.1-flash-lite-preview';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Pool de claves. Se leen de GEMINI_API_KEY, GEMINI_API_KEY_2, _3... y cada
 * secreto admite ademas varias claves separadas por coma, para poder ampliar
 * el pool sin crear secretos nuevos.
 */
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

// Errores que justifican pasar a la siguiente clave en vez de rendirse
const ES_CUOTA = /quota|rate.?limit|RESOURCE_EXHAUSTED|exhausted|too many requests/i;

// Lo que le pedimos a Gemini que devuelva, con tipos estrictos
const esquema = {
  type: 'OBJECT',
  properties: {
    comercio: { type: 'STRING', description: 'Nombre del local o tienda' },
    ruc: { type: 'STRING', description: 'RUC del emisor, solo digitos' },
    fecha: { type: 'STRING', description: 'Fecha de emision en formato YYYY-MM-DD' },
    monto_total: { type: 'NUMBER', description: 'Total pagado' },
    moneda: { type: 'STRING', description: 'PEN o USD' },
    metodo_pago: { type: 'STRING', description: 'efectivo, tarjeta, yape, plin o transferencia' },
    categoria_sugerida: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          nombre: { type: 'STRING' },
          cantidad: { type: 'NUMBER' },
          precio: { type: 'NUMBER' },
        },
      },
    },
    confianza: { type: 'NUMBER', description: 'Entre 0 y 1, que tan seguro estas de la lectura' },
    notas: { type: 'STRING', description: 'Que no se pudo leer, si algo' },
  },
  required: ['monto_total', 'confianza'],
};

function bytesDesdeBase64(b64: string): string {
  return b64.includes(',') ? b64.split(',')[1] : b64;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const claves = obtenerClaves();
    if (!claves.length) return json({ error: 'No hay ninguna GEMINI_API_KEY cargada.' }, 400);

    const b = await req.json().catch(() => ({}));

    // Utilidad de diagnostico: que modelos acepta la primera clave
    if (b.listar_modelos) {
      const r = await fetch(`${BASE}/models?key=${claves[0]}&pageSize=100`);
      const j = await r.json();
      const nombres = (j.models || [])
        .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m: any) => m.name.replace('models/', ''));
      return json({ ok: true, claves_en_pool: claves.length, modelos: nombres, error_google: j.error?.message });
    }

    if (!b.foto?.base64) return json({ error: 'Falta la foto.' }, 400);

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Se le pasan las categorias reales para que sugiera una de las nuestras
    const { data: cats } = await supa.from('categorias').select('nombre').eq('activo', true);
    const listaCats = (cats || []).map((c: any) => c.nombre).join(', ');
    const hoy = new Date().toISOString().slice(0, 10);

    const prompt =
      `Eres un lector de boletas y facturas peruanas. Extrae los datos de esta imagen.\n\n` +
      `Reglas:\n` +
      `- El monto_total es el TOTAL final pagado, no el subtotal ni el IGV.\n` +
      `- Los montos en soles suelen aparecer como "S/" o "SOLES". Usa PEN para soles y USD para dolares.\n` +
      `- La fecha va en formato YYYY-MM-DD. Hoy es ${hoy}; si la boleta no tiene fecha legible, usa hoy.\n` +
      `- categoria_sugerida debe ser exactamente una de estas: ${listaCats}.\n` +
      `- En items pon los productos que puedas leer con su precio. Si la boleta tiene mas de 15, ` +
      `incluye solo los 15 mas caros.\n` +
      `- confianza refleja que tan legible estaba la boleta: 1 es perfectamente legible, ` +
      `0.5 dudas en varios campos, menos de 0.3 casi ilegible.\n` +
      `- Si un campo no se puede leer, omitelo en vez de inventarlo, y dilo en notas.`;

    const cuerpo = JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: b.foto.mime || 'image/jpeg', data: bytesDesdeBase64(b.foto.base64) } },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: esquema,
        temperature: 0,
      },
    });

    // Se arranca en una clave al azar para repartir el gasto del nivel
    // gratuito, y solo se pasa a la siguiente si la que toco esta agotada.
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
      const agotada = r.status === 429 || ES_CUOTA.test(ultimoError);
      if (!agotada) {
        return json({ error: 'Gemini: ' + ultimoError, modelo: MODELO }, 502);
      }
      console.warn(`clave ${usada + 1}/${claves.length} agotada, probando la siguiente`);
      j = null;
    }

    if (!j) {
      return json({
        error: 'Todas las claves de Gemini estan al limite. ' + ultimoError,
        claves_probadas: claves.length,
      }, 429);
    }

    const texto = j.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) return json({ error: 'Gemini no devolvio contenido.', respuesta: j }, 502);

    let datos: any;
    try {
      datos = JSON.parse(texto);
    } catch {
      return json({ error: 'Gemini devolvio algo que no es JSON.', texto }, 502);
    }

    // Resolvemos la categoria sugerida contra la tabla real
    let categoria_id: string | null = null;
    if (datos.categoria_sugerida) {
      const { data: cat } = await supa
        .from('categorias').select('id')
        .ilike('nombre', datos.categoria_sugerida).maybeSingle();
      categoria_id = cat?.id ?? null;
    }

    // Si se pasa un gasto existente, se guarda la lectura para tenerla de registro
    if (b.gasto_id) {
      await supa.from('gastos').update({
        ocr_json: datos,
        confianza_ocr: datos.confianza ?? null,
      }).eq('id', b.gasto_id);
    }

    return json({ ok: true, modelo: MODELO, clave: `${usada + 1}/${claves.length}`, datos, categoria_id });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
