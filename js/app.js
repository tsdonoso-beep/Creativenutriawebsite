import * as api from './api.js';
import * as cola from './cola.js';
import { iconos, nutria, nutriaDormida } from './iconos.js';
import { REINTENTO_MS, PALETA, PALETA_OSCURA, GRIS_OTROS, MAX_SEGMENTOS } from './config.js';

// ---------------------------------------------------------------- utilidades

const $ = (s) => document.querySelector(s);
const hoy = () => new Date().toISOString().slice(0, 10);
const periodoDe = (f) => f.slice(0, 7);

const nf = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plata = (n) => nf.format(Number(n || 0));
const soles = (n) => `<span class="moneda">S/</span> ${plata(n)}`;
/** La misma cifra sin marcado, para cuando va dentro de otra frase. */
const solesTxt = (n) => `S/ ${plata(n)}`;

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function mesLargo(periodo) {
  const [a, m] = periodo.split('-');
  return `${MESES[+m - 1]} ${a}`;
}

function fechaCorta(f) {
  const d = new Date(f + 'T12:00:00');
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  if (f === hoy()) return 'Hoy';
  if (f === ayer.toISOString().slice(0, 10)) return 'Ayer';
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

function cuandoTarea(dias) {
  if (dias < -1) return `Atrasada ${Math.abs(dias)} días`;
  if (dias === -1) return 'Atrasada 1 día';
  if (dias === 0) return 'Toca hoy';
  if (dias === 1) return 'Mañana';
  return `En ${dias} días`;
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }));

const vibrar = (ms = 8) => navigator.vibrate?.(ms);

function brindis(texto) {
  const el = $('#brindis');
  el.textContent = texto;
  el.dataset.visible = '1';
  clearTimeout(brindis._t);
  brindis._t = setTimeout(() => (el.dataset.visible = '0'), 2600);
}

function avatar(u, grande = false) {
  if (!u) return '';
  const ini = (u.nombre || u.asignado_nombre || '?').trim()[0].toUpperCase();
  const color = u.color || u.asignado_color || '#6C9066';
  return `<span class="avatar${grande ? ' g' : ''}" style="background:${color}">${ini}</span>`;
}

/** Un PDF no se puede comprimir como imagen: se manda tal cual. */
function leerComoBase64(archivo) {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok({
      base64: String(lector.result).split(',')[1],
      mime: archivo.type || 'application/pdf',
    });
    lector.onerror = mal;
    lector.readAsDataURL(archivo);
  });
}

/** Reduce la foto antes de mandarla: menos datos por la red y Gemini lee igual. */
function comprimir(archivo, ladoMax = 1400, calidad = 0.72) {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, ladoMax / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        ok({ base64: c.toDataURL('image/jpeg', calidad).split(',')[1], mime: 'image/jpeg' });
      };
      img.onerror = mal;
      img.src = lector.result;
    };
    lector.onerror = mal;
    lector.readAsDataURL(archivo);
  });
}

// -------------------------------------------------------------------- estado

const estado = {
  usuario: null,
  usuarios: [],
  categorias: [],
  periodo: periodoDe(hoy()),
  vista: 'inicio',
  tipos: [],
  d: { gastos: [], balance: [], total: [], resumen: [], lista: [], tareas: [], servicios: [] },
  enCola: 0,
  cargando: true,
  fotoPendiente: null,
  reciboPendiente: null,
  lecturaIA: null,
};

const SECCIONES = [
  { id: 'inicio',    txt: 'Inicio',    ic: 'casa' },
  { id: 'gastos',    txt: 'Gastos',    ic: 'recibo' },
  { id: 'servicios', txt: 'Servicios', ic: 'calendario' },
  { id: 'lista',     txt: 'Lista',     ic: 'carrito' },
  { id: 'tareas',    txt: 'Tareas',    ic: 'escoba' },
];

// ------------------------------------------------------- barra de distribucion

const temaOscuro = () =>
  document.documentElement.dataset.tema === 'oscuro' ||
  (document.documentElement.dataset.tema !== 'claro' &&
   matchMedia('(prefers-color-scheme: dark)').matches);

/**
 * Barra apilada con su leyenda. Los segmentos llevan 2px de separacion y
 * extremos redondeados. La identidad nunca queda solo en el color: cada
 * segmento aparece nombrado y con su monto en la leyenda, que es lo que
 * salva la lectura a quien no distingue bien los tonos.
 */
function barraDist(items, etiqueta) {
  const total = items.reduce((a, i) => a + i.valor, 0);
  if (!total) return '';
  return `
    <div class="barra-dist" role="img" aria-label="${escapar(etiqueta)}">
      ${items.map((i) => `<span style="flex:${i.valor};background:${i.color}"></span>`).join('')}
    </div>
    <div class="leyenda">
      ${items.map((i) => `
        <span><i style="background:${i.color}"></i>${escapar(i.nombre)}
          <b>${soles(i.valor)}</b></span>`).join('')}
    </div>`;
}

/** Las categorias del mes, de mayor a menor. Pasadas 6, el resto va a "Otros". */
function segmentosCategorias() {
  const paleta = temaOscuro() ? PALETA_OSCURA : PALETA;
  const r = [...(estado.d.resumen || [])]
    .filter((c) => Number(c.total_pen) > 0)
    .sort((a, b) => Number(b.total_pen) - Number(a.total_pen));

  const segs = r.slice(0, MAX_SEGMENTOS).map((c, i) => ({
    nombre: c.categoria || 'Sin categoria',
    valor: Number(c.total_pen),
    color: paleta[i],
  }));
  const resto = r.slice(MAX_SEGMENTOS)
    .reduce((a, c) => a + Number(c.total_pen), 0);
  if (resto > 0) segs.push({ nombre: 'Otros', valor: resto, color: GRIS_OTROS });
  return segs;
}

/**
 * Cuanto puso cada uno este mes y que porcentaje representa.
 * Se calcula sobre los gastos del periodo, no sobre el balance historico:
 * la pregunta es "como vamos este mes", no "desde siempre".
 */
function aportesDelMes() {
  const porPersona = new Map();
  for (const g of estado.d.gastos || []) {
    const k = g.pagado_por_nombre;
    porPersona.set(k, (porPersona.get(k) || 0) + Number(g.monto_pen || 0));
  }
  const total = [...porPersona.values()].reduce((a, b) => a + b, 0);
  return estado.usuarios.map((u) => {
    const puesto = porPersona.get(u.nombre) || 0;
    return {
      nombre: u.nombre,
      color: u.color || '#6C9066',
      puesto,
      pct: total ? (puesto / total) * 100 : 0,
      meta: Number(u.porcentaje_default || 0),
    };
  });
}

// -------------------------------------------------------------------- vistas

function cabecera() {
  const nom = estado.usuario?.nombre?.split(' ')[0] || '';
  const h = new Date().getHours();
  const saludo = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días'
                : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  const titulos = {
    inicio: `${saludo},<br><span class="suave">${escapar(nom)}</span>`,
    gastos: `Gastos de<br><span class="suave">${mesLargo(estado.periodo)}</span>`,
    servicios: 'Servicios<br><span class="suave">por pagar</span>',
    lista:  'Lista de<br><span class="suave">compras</span>',
    tareas: 'Tareas de<br><span class="suave">la casa</span>',
  };
  const cola = estado.enCola
    ? `<span class="cola-pastilla">${iconos.nube} ${estado.enCola} en cola</span>` : '';

  return `
    <div style="display:flex;align-items:flex-start;gap:12px">
      <div style="flex:1;min-width:0">
        <div class="saludo"><span class="marca">${nutria(19, 'currentColor')}</span>
          LA NUTRIA APP ${cola}</div>
        <h1 class="titulo-grande">${titulos[estado.vista]}</h1>
      </div>
      <button data-accion="cambiar-usuario" aria-label="Cambiar de persona"
              style="margin-top:6px">${avatar(estado.usuario, true)}</button>
    </div>`;
}

function vInicio() {
  if (!estado.usuario) return '';
  const { balance, total, lista, tareas, servicios } = estado.d;
  const yo    = balance.find((b) => b.usuario_id === estado.usuario.id);
  const otro  = balance.find((b) => b.usuario_id !== estado.usuario.id);
  const saldo = Number(yo?.saldo || 0);
  const gastado = Number(total?.[0]?.total_pen || 0);

  const segs    = segmentosCategorias();
  const aportes = aportesDelMes();
  const puesto  = aportes.reduce((a, x) => a + x.puesto, 0);

  const porVencer = (servicios || [])
    .filter((s) => s.estado !== 'pagado')
    .sort((a, b) => a.dias_faltantes - b.dias_faltantes)
    .slice(0, 3);
  const pendientes = lista.filter((i) => !i.comprado);
  const urgentes   = tareas.filter((t) => t.dias_restantes <= 0);
  const mias       = tareas.filter((t) => t.asignado_a === estado.usuario.id && t.dias_restantes <= 1);

  const frase = Math.abs(saldo) < 0.01
    ? 'Están a mano'
    : saldo > 0
      ? `${escapar(otro?.nombre || '')} te debe`
      : `Le debes a ${escapar(otro?.nombre || '')}`;

  return `
  <div class="deslizar-entrada">

    <div class="tarjeta">
      <div class="saludo" style="letter-spacing:.08em">EN QUÉ SE FUE ${mesLargo(estado.periodo).toUpperCase()}</div>
      <div class="monto-grande">${soles(gastado)}</div>
      ${segs.length
        ? barraDist(segs, 'Distribución del gasto por categoría')
        : '<div class="fila-sub" style="margin-top:10px">Todavía no hay gastos este mes</div>'}
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cab">
        <span class="chapa verde">${iconos.balanza}</span>
        <h2>Quién puso cuánto</h2>
      </div>
      ${puesto
        ? barraDist(
            aportes.filter((a) => a.puesto > 0).map((a) => ({
              nombre: a.nombre, valor: a.puesto, color: a.color,
            })),
            'Aporte de cada uno este mes')
        : ''}
      <div class="aporte">
        ${aportes.map((a) => `
          <div>
            <div class="quien">${avatar({ nombre: a.nombre, color: a.color })} ${escapar(a.nombre)}</div>
            <div class="cuanto">${soles(a.puesto)}</div>
            <div class="pct">${a.pct.toFixed(0)}% <span class="meta">· le toca ${a.meta.toFixed(0)}%</span></div>
          </div>`).join('')}
      </div>
      <div class="fila" style="margin-top:14px">
        <div class="fila-txt"><div class="fila-sub">${frase}</div></div>
        <div class="fila-val ${Math.abs(saldo) < 0.01 ? '' : saldo > 0 ? 'positivo' : 'negativo'}">
          ${soles(Math.abs(saldo))}
        </div>
      </div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cab">
        <span class="chapa naranja">${iconos.calendario}</span>
        <h2>Por pagar</h2>
        ${porVencer.filter((s) => s.dias_faltantes <= 0).length
          ? `<span class="insignia">${porVencer.filter((s) => s.dias_faltantes <= 0).length}</span>`
          : ''}
      </div>
      ${porVencer.length
        ? porVencer.map(filaServicio).join('')
        : '<div class="fila-sub">Nada pendiente este mes</div>'}
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cab">
        <span class="chapa naranja">${iconos.carrito}</span>
        <h2>Lista de compras</h2>
        ${pendientes.length ? `<span class="insignia">${pendientes.length}</span>` : ''}
      </div>
      ${pendientes.length
        ? pendientes.slice(0, 4).map((i) => `
            <div class="fila">
              <div class="fila-txt"><div class="fila-tit">${escapar(i.nombre)}</div></div>
              <div class="fila-val" style="color:var(--ink-3);font-weight:600">
                ${i.cantidad > 1 ? escapar(i.cantidad + ' ' + i.unidad) : ''}
              </div>
            </div>`).join('')
        : '<div class="fila-sub">No falta nada por comprar</div>'}
      ${pendientes.length > 4
        ? `<div class="fila-sub" style="padding-top:10px">y ${pendientes.length - 4} más</div>` : ''}
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cab">
        <span class="chapa">${iconos.escoba}</span>
        <h2>Tareas</h2>
        ${urgentes.length ? `<span class="insignia">${urgentes.length}</span>`
                          : '<span class="insignia calma">al día</span>'}
      </div>
      ${(mias.length ? mias : tareas.slice(0, 3)).map((t) => `
        <div class="fila">
          <span class="chapa" style="width:30px;height:30px;border-radius:9px">
            ${iconos[t.icono] || iconos.tarea}</span>
          <div class="fila-txt">
            <div class="fila-tit">${escapar(t.titulo)}</div>
            <div class="fila-sub" style="color:${t.dias_restantes <= 0 ? 'var(--rojo)' : 'var(--ink-3)'}">
              ${cuandoTarea(t.dias_restantes)}</div>
          </div>
          ${avatar(t)}
        </div>`).join('') || '<div class="fila-sub">Nada pendiente</div>'}
    </div>
  </div>`;
}

/** Una fila de servicio: lo primero que se lee es cuando vence y cuanto falta. */
function filaServicio(s) {
  const u = s.urgencia;
  const dias = Number(s.dias_faltantes);
  const numero = u === 'pagado' ? '✓'
    : dias === 0 ? 'hoy'
    : dias < 0 ? Math.abs(dias)
    : dias;
  const unidad = u === 'pagado' ? 'pagado'
    : dias === 0 ? ''
    : dias < 0 ? (dias === -1 ? 'día tarde' : 'días tarde')
    : (dias === 1 ? 'día' : 'días');

  return `
    <div class="fila" data-accion="abrir-servicio" data-id="${s.pago_id || ''}" role="button">
      <span class="chapa ${u === 'vencido' ? 'naranja' : u === 'pagado' ? 'verde' : ''}">
        ${iconos[iconoServicio(s.categoria)] || iconos.calendario}</span>
      <div class="fila-txt">
        <div class="fila-tit">${escapar(s.nombre)}</div>
        <div class="serv-fecha ${u}">
          ${escapar(fechaLarga(s.fecha_vencimiento))}
          ${s.monto != null ? ' · ' + solesTxt(s.monto) : ''}
        </div>
      </div>
      <div class="serv-dias ${u}">
        <span class="n">${numero}</span>
        <span class="u">${unidad}</span>
      </div>
    </div>`;
}

const ICONOS_SERVICIO = {
  Luz: 'destello', Gas: 'cocina', Internet: 'nube',
  Alquiler: 'casa', Mantenimiento: 'tarea',
};
const iconoServicio = (categoria) => ICONOS_SERVICIO[categoria] || 'calendario';

function fechaLarga(f) {
  if (!f) return '';
  const d = new Date(f + 'T12:00:00');
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

function vServicios() {
  const s = estado.d.servicios || [];
  if (!s.length) return `
    <div class="vacio">${nutriaDormida(72)}
      <strong>No hay servicios cargados</strong>
      <p>Agrega el alquiler, la luz o el internet con el botón naranja.</p></div>`;

  const pendientes = s.filter((x) => x.estado !== 'pagado');
  const pagados    = s.filter((x) => x.estado === 'pagado');
  const porPagar   = pendientes.reduce((a, x) => a + Number(x.monto || 0), 0);
  const yaPagado   = pagados.reduce((a, x) => a + Number(x.monto || 0), 0);

  return `
  <div class="deslizar-entrada">
    <div class="tarjeta">
      <div class="saludo" style="letter-spacing:.08em">FALTA PAGAR EN ${mesLargo(estado.periodo).toUpperCase()}</div>
      <div class="monto-grande">${soles(porPagar)}</div>
      ${yaPagado ? `<div class="fila-sub" style="margin-top:4px">
        Ya pagaron ${solesTxt(yaPagado)} este mes</div>` : ''}
    </div>

    ${pendientes.length ? `
      <div class="tarjeta">
        <div class="tarjeta-cab"><h2 style="font-size:15px;color:var(--ink-3)">Pendientes</h2></div>
        ${pendientes.map(filaServicio).join('')}
      </div>` : ''}

    ${pagados.length ? `
      <div class="tarjeta">
        <div class="tarjeta-cab"><h2 style="font-size:15px;color:var(--ink-3)">Pagados</h2></div>
        ${pagados.map(filaServicio).join('')}
      </div>` : ''}
  </div>`;
}

function vGastos() {
  const { gastos, resumen, total } = estado.d;
  const gastado = Number(total?.[0]?.total_pen || 0);

  if (!gastos.length) return `
    <div class="tarjeta">${resumenCabecera(gastado)}</div>
    <div class="vacio">${nutriaDormida(72)}
      <strong>Todavía nada este mes</strong>
      <p>Toca el botón naranja para registrar el primer gasto.</p></div>`;

  const porDia = {};
  for (const g of gastos) (porDia[g.fecha_gasto] ||= []).push(g);

  return `
  <div class="deslizar-entrada">
    <div class="tarjeta">
      ${resumenCabecera(gastado)}
      ${resumen.slice(0, 5).map((c) => {
        const pct = gastado ? (c.total_pen / gastado) * 100 : 0;
        return `
        <div class="fila">
          <div class="fila-txt">
            <div class="fila-tit">${escapar(c.categoria || 'Sin categoría')}</div>
            <div style="height:5px;border-radius:99px;background:var(--bg-hueco);margin-top:6px">
              <div style="height:100%;width:${pct.toFixed(1)}%;border-radius:99px;background:var(--acento)"></div>
            </div>
          </div>
          <div class="fila-val">${soles(c.total_pen)}</div>
        </div>`; }).join('')}
    </div>

    ${Object.entries(porDia).map(([fecha, items]) => `
      <div class="tarjeta">
        <div class="tarjeta-cab"><h2 style="font-size:15px;color:var(--ink-3)">${fechaCorta(fecha)}</h2></div>
        ${items.map((g) => `
          <div class="fila">
            <span class="chapa">${iconos.recibo}</span>
            <div class="fila-txt">
              <div class="fila-tit">${escapar(g.comercio || g.categoria || 'Gasto')}</div>
              <div class="fila-sub">
                ${escapar(g.categoria || '')} · pagó ${escapar(g.pagado_por_nombre)}
                ${g.drive_url ? ' · 📎' : ''}
              </div>
            </div>
            <div class="fila-val">${soles(g.monto_pen)}</div>
          </div>`).join('')}
      </div>`).join('')}
  </div>`;
}

const resumenCabecera = (gastado) => `
  <div class="saludo">TOTAL DEL MES</div>
  <div class="monto-grande">${soles(gastado)}</div>`;

function vLista() {
  const { lista } = estado.d;
  const pendientes = lista.filter((i) => !i.comprado);
  const comprados = lista.filter((i) => i.comprado);

  return `
  <div class="deslizar-entrada">
    <form class="tarjeta" data-form="item" style="display:flex;gap:9px;align-items:center;padding:12px">
      <input class="entrada" name="nombre" placeholder="Agregar producto…"
             autocomplete="off" required style="border:0;background:none;padding:8px 4px">
      <button class="btn-icono" style="background:var(--acento);color:#fff" aria-label="Agregar">
        ${iconos.mas}</button>
    </form>

    ${comprados.length ? `
      <button class="btn acento" data-accion="registrar-compra" style="margin-bottom:14px">
        ${iconos.recibo} Registrar gasto de ${comprados.length} producto${comprados.length > 1 ? 's' : ''}
      </button>` : ''}

    ${pendientes.length || comprados.length ? `
      <div class="tarjeta">
        ${pendientes.map(itemFila).join('')}
        ${comprados.length && pendientes.length ? '<div style="height:8px"></div>' : ''}
        ${comprados.map(itemFila).join('')}
      </div>` : `
      <div class="vacio">${nutriaDormida(72)}
        <strong>La lista está vacía</strong>
        <p>Escribe arriba lo que falte en casa. Los dos ven la misma lista.</p></div>`}
  </div>`;
}

const itemFila = (i) => `
  <div class="fila ${i.comprado ? 'hecho' : ''}">
    <button class="casilla" data-marcada="${i.comprado ? 1 : 0}"
            data-accion="marcar-item" data-id="${i.id}" aria-label="Marcar comprado">
      ${iconos.chulo}</button>
    <div class="fila-txt">
      <div class="fila-tit">${escapar(i.nombre)}</div>
      ${i.cantidad > 1 ? `<div class="fila-sub">${escapar(i.cantidad)} ${escapar(i.unidad)}</div>` : ''}
    </div>
    <button class="btn-icono" data-accion="borrar-item" data-id="${i.id}"
            aria-label="Quitar" style="background:none;color:var(--ink-3)">${iconos.cerrar}</button>
  </div>`;

function vTareas() {
  const { tareas } = estado.d;
  if (!tareas.length) return `
    <div class="vacio">${nutriaDormida(72)}
      <strong>No hay tareas</strong>
      <p>Crea la primera con el botón naranja.</p></div>`;

  const grupos = {
    vencida: tareas.filter((t) => t.estado === 'vencida'),
    hoy:     tareas.filter((t) => t.estado === 'hoy'),
    proxima: tareas.filter((t) => t.estado === 'proxima'),
  };
  const rotulo = { vencida: 'Atrasadas', hoy: 'Para hoy', proxima: 'Más adelante' };

  return `<div class="deslizar-entrada">
    ${Object.entries(grupos).filter(([, v]) => v.length).map(([k, v]) => `
      <div class="tarjeta">
        <div class="tarjeta-cab">
          <h2 style="font-size:15px;color:${k === 'vencida' ? 'var(--rojo)' : 'var(--ink-3)'}">
            ${rotulo[k]}</h2>
        </div>
        ${v.map((t) => `
          <div class="fila">
            <span class="chapa ${k === 'vencida' ? 'naranja' : ''}">
              ${iconos[t.icono] || iconos.tarea}</span>
            <div class="fila-txt">
              <div class="fila-tit">${escapar(t.titulo)}</div>
              <div class="fila-sub">
                ${cuandoTarea(t.dias_restantes)}${t.frecuencia_dias ? ` · cada ${t.frecuencia_dias} días` : ''}
              </div>
            </div>
            ${avatar(t)}
            <button class="casilla" data-accion="completar-tarea" data-id="${t.id}"
                    aria-label="Completar">${iconos.chulo}</button>
          </div>`).join('')}
      </div>`).join('')}
  </div>`;
}

function vEntrar(error = '') {
  return `
  <div class="portada deslizar-entrada">
    <div class="marca-portada">${nutria(76, 'currentColor')}</div>
    <h1>La Nutria App</h1>
    <p>Los gastos, la lista de compras y las tareas de la casa, en un solo lugar.</p>
    <form data-form="entrar">
      <input class="entrada" name="email" type="email" inputmode="email"
             autocomplete="username" placeholder="Correo de la casa" required>
      <input class="entrada" name="password" type="password"
             autocomplete="current-password" placeholder="Contraseña" required>
      <button class="btn acento" type="submit">Entrar</button>
      ${error ? `<div class="aviso malo" style="margin:12px 0 0">${escapar(error)}</div>` : ''}
    </form>
    <small>Una sola cuenta para los dos. Se queda guardada en este teléfono.</small>
  </div>`;
}

function pintarEntrar(error = '') {
  $('#cabecera').innerHTML = '';
  $('#tabbar').innerHTML = '';
  $('#flotante').hidden = true;
  $('#vista').innerHTML = vEntrar(error);
}

// --------------------------------------------------------------------- hojas

function abrirHoja(html) {
  $('#hoja').innerHTML = `<div class="agarradera"></div>${html}`;
  $('#hoja').dataset.abierta = '1';
  $('#fondo-hoja').dataset.abierta = '1';
}
function cerrarHoja() {
  $('#hoja').dataset.abierta = '0';
  $('#fondo-hoja').dataset.abierta = '0';
  estado.fotoPendiente = null;
  estado.reciboPendiente = null;
  estado.lecturaIA = null;
}

function hojaUsuario() {
  abrirHoja(`
    <h2 id="hoja-titulo">¿Quién eres?</h2>
    <div style="display:grid;gap:10px">
      ${estado.usuarios.map((u) => `
        <button class="tarjeta plana" data-accion="elegir-usuario" data-id="${u.id}"
                style="display:flex;align-items:center;gap:13px;text-align:left;width:100%">
          ${avatar(u, true)}
          <div class="fila-txt">
            <div class="fila-tit">${escapar(u.nombre)}</div>
            <div class="fila-sub">Le toca el ${plata(u.porcentaje_default)}% de los gastos</div>
          </div>
        </button>`).join('')}
    </div>
    <button class="btn fantasma" data-accion="salir" style="margin-top:14px">Cerrar sesión</button>`);
}

/** Las categorias del tipo elegido. Al cambiar de tipo se vuelven a pintar. */
function pastillasCategoria(tipoId, seleccionada) {
  const cats = estado.categorias.filter((c) => c.tipo_id === tipoId);
  return cats.map((c, i) => `
    <button type="button" class="pastilla" data-valor="${c.id}"
      aria-pressed="${seleccionada ? seleccionada === c.id : i === 0}">
      ${escapar(c.nombre)}</button>`).join('');
}

function hojaGasto(prefill = {}) {
  // Si viene una categoria precargada, el tipo sale de ella
  const cat = estado.categorias.find((c) => c.id === prefill.categoria_id);
  const tipoInicial = cat?.tipo_id || estado.tipos[0]?.id;
  const repartoInicial = estado.tipos.find((t) => t.id === tipoInicial)?.reparto_default || 'default';
  abrirHoja(`
    <h2 id="hoja-titulo">Nuevo gasto</h2>
    <form data-form="gasto">
      <div class="campo">
        <label class="zona-foto" id="zona-foto">
          ${iconos.camara}
          <strong>Foto de la boleta</strong>
          <small>Gemini lee el monto y el comercio</small>
          <input type="file" accept="image/*" capture="environment" name="foto">
        </label>
        <div id="estado-foto"></div>
      </div>

      <div class="campo">
        <label>Monto</label>
        <input class="entrada" name="monto" type="number" step="0.01" inputmode="decimal"
               placeholder="0.00" required value="${prefill.monto ?? ''}"
               style="font-size:26px;font-weight:750">
      </div>

      <div class="dos">
        <div class="campo">
          <label>Comercio</label>
          <input class="entrada" name="comercio" placeholder="Wong, Metro…"
                 value="${escapar(prefill.comercio ?? '')}">
        </div>
        <div class="campo">
          <label>Fecha</label>
          <input class="entrada" name="fecha_gasto" type="date" value="${prefill.fecha || hoy()}">
        </div>
      </div>

      <div class="campo">
        <label>Tipo</label>
        <div class="pastillas" data-grupo="tipo">
          ${estado.tipos.map((t, i) => `
            <button type="button" class="pastilla" data-valor="${t.id}"
              data-reparto="${t.reparto_default}"
              aria-pressed="${tipoInicial === t.id}">${escapar(t.nombre)}</button>`).join('')}
        </div>
      </div>

      <div class="campo">
        <label>Categoría</label>
        <div class="pastillas" data-grupo="categoria" id="pastillas-categoria">
          ${pastillasCategoria(tipoInicial, prefill.categoria_id)}
        </div>
      </div>

      <div class="campo">
        <label>Pagó</label>
        <div class="pastillas" data-grupo="pagado_por">
          ${estado.usuarios.map((u) => `
            <button type="button" class="pastilla persona" data-valor="${u.id}"
              style="--tono:${u.color}" aria-pressed="${u.id === estado.usuario.id}">
              ${escapar(u.nombre)}</button>`).join('')}
        </div>
      </div>

      <div class="campo">
        <label>Reparto</label>
        <div class="pastillas" data-grupo="reparto_tipo">
          <button type="button" class="pastilla" data-valor="default"
            aria-pressed="${repartoInicial === 'default'}">60/40</button>
          <button type="button" class="pastilla" data-valor="igual"
            aria-pressed="${repartoInicial === 'igual'}">Mitad y mitad</button>
          <button type="button" class="pastilla" data-valor="personal"
            aria-pressed="${repartoInicial === 'personal'}">Solo mío</button>
        </div>
      </div>

      <div class="campo">
        <label>Nota</label>
        <textarea class="entrada" name="descripcion"
                  placeholder="Opcional">${escapar(prefill.descripcion ?? '')}</textarea>
      </div>

      <button class="btn acento" type="submit">Guardar gasto</button>
      <button class="btn fantasma" type="button" data-accion="cerrar-hoja">Cancelar</button>
    </form>`);
}

function hojaTarea() {
  abrirHoja(`
    <h2 id="hoja-titulo">Nueva tarea</h2>
    <form data-form="tarea">
      <div class="campo">
        <label>¿Qué hay que hacer?</label>
        <input class="entrada" name="titulo" placeholder="Regar las plantas" required>
      </div>
      <div class="dos">
        <div class="campo">
          <label>Cada cuántos días</label>
          <input class="entrada" name="frecuencia_dias" type="number" min="1" value="7" required>
        </div>
        <div class="campo">
          <label>Empieza</label>
          <input class="entrada" name="proxima_fecha" type="date" value="${hoy()}">
        </div>
      </div>
      <div class="campo">
        <label>Empieza por</label>
        <div class="pastillas" data-grupo="asignado_a">
          ${estado.usuarios.map((u) => `
            <button type="button" class="pastilla persona" data-valor="${u.id}"
              style="--tono:${u.color}" aria-pressed="${u.id === estado.usuario.id}">
              ${escapar(u.nombre)}</button>`).join('')}
        </div>
      </div>
      <div class="aviso info">${iconos.destello} Al completarla, se reprograma sola y le toca al otro.</div>
      <button class="btn acento" type="submit">Crear tarea</button>
      <button class="btn fantasma" type="button" data-accion="cerrar-hoja">Cancelar</button>
    </form>`);
}


function hojaServicio(servicio = null) {
  const editar = !!servicio;
  const mensual = estado.tipos.find((t) => t.reparto_default === 'default');
  const cats = estado.categorias.filter((c) => c.tipo_id === mensual?.id);

  abrirHoja(`
    <h2 id="hoja-titulo">${editar ? 'Editar servicio' : 'Nuevo servicio'}</h2>
    <form data-form="servicio" data-id="${servicio?.servicio_id || ''}">
      <div class="campo">
        <label>Nombre</label>
        <input class="entrada" name="nombre" required placeholder="Luz, Internet, Alquiler…"
               value="${escapar(servicio?.nombre ?? '')}">
      </div>

      <div class="campo">
        <label>Categoría</label>
        <div class="pastillas" data-grupo="categoria">
          ${cats.map((c, i) => `
            <button type="button" class="pastilla" data-valor="${c.id}"
              aria-pressed="${servicio ? servicio.categoria_id === c.id : i === 0}">
              ${escapar(c.nombre)}</button>`).join('')}
        </div>
      </div>

      <div class="dos">
        <div class="campo">
          <label>Monto estimado</label>
          <input class="entrada" name="monto_estimado" type="number" step="0.01"
                 inputmode="decimal" value="${servicio?.monto_estimado ?? ''}">
        </div>
        <div class="campo">
          <label>Vence el día</label>
          <input class="entrada" name="dia_vencimiento" type="number" min="1" max="31"
                 required value="${servicio?.dia_vencimiento ?? 15}">
        </div>
      </div>

      <div class="campo">
        <label>Quién lo paga</label>
        <div class="pastillas" data-grupo="responsable_id">
          ${estado.usuarios.map((u) => `
            <button type="button" class="pastilla persona" data-valor="${u.id}"
              style="--tono:${u.color}"
              aria-pressed="${(servicio?.responsable_id ?? estado.usuario.id) === u.id}">
              ${escapar(u.nombre)}</button>`).join('')}
        </div>
      </div>

      <div class="dos">
        <div class="campo">
          <label>Proveedor</label>
          <input class="entrada" name="proveedor" placeholder="PLUZ, Movistar…"
                 value="${escapar(servicio?.proveedor ?? '')}">
        </div>
        <div class="campo">
          <label>N° de suministro</label>
          <input class="entrada" name="numero_suministro" inputmode="numeric"
                 value="${escapar(servicio?.numero_suministro ?? '')}">
        </div>
      </div>

      <div class="aviso info">${iconos.destello}
        Con el número de suministro, la app reconoce sola de qué servicio es cada recibo.</div>

      <button class="btn acento" type="submit">${editar ? 'Guardar cambios' : 'Crear servicio'}</button>
      <button class="btn fantasma" type="button" data-accion="cerrar-hoja">Cancelar</button>
    </form>`);
}

function hojaPagar(pagoId) {
  const s = (estado.d.servicios || []).find((x) => x.pago_id === pagoId);
  if (!s) return;

  abrirHoja(`
    <h2 id="hoja-titulo">${escapar(s.nombre)}</h2>
    <div class="fila" style="border:0;padding-top:0">
      <div class="fila-txt">
        <div class="serv-fecha ${s.urgencia}">Vence el ${escapar(fechaLarga(s.fecha_vencimiento))}</div>
      </div>
      <span class="cinta ${s.urgencia}">${
        s.urgencia === 'pagado' ? 'Pagado'
        : s.urgencia === 'vencido' ? 'Vencido'
        : s.urgencia === 'hoy' ? 'Vence hoy' : 'Al día'}</span>
    </div>

    <form data-form="pagar" data-id="${pagoId}">
      <div class="campo">
        <label class="zona-foto" id="zona-recibo">
          ${iconos.subir}
          <strong>Subir el recibo</strong>
          <small>PDF o foto · Gemini lee el monto y el vencimiento</small>
          <input type="file" accept="image/*,application/pdf" name="recibo">
        </label>
        <div id="estado-recibo"></div>
      </div>

      <div class="campo">
        <label>Monto a pagar</label>
        <input class="entrada" name="monto" type="number" step="0.01" inputmode="decimal"
               required value="${s.monto ?? ''}" style="font-size:26px;font-weight:750">
      </div>

      <div class="dos">
        <div class="campo">
          <label>Fecha de pago</label>
          <input class="entrada" name="fecha" type="date" value="${hoy()}">
        </div>
        <div class="campo">
          <label>Puso la plata</label>
          <div class="pastillas" data-grupo="pagado_por">
            ${estado.usuarios.map((u) => `
              <button type="button" class="pastilla persona" data-valor="${u.id}"
                style="--tono:${u.color}"
                aria-pressed="${(s.responsable_id ?? estado.usuario.id) === u.id}">
                ${escapar(u.nombre)}</button>`).join('')}
          </div>
        </div>
      </div>

      ${s.estado === 'pagado'
        ? `<div class="aviso bueno">${iconos.chulo} Ya está pagado${s.drive_url
            ? ` · <a href="${s.drive_url}" target="_blank" rel="noopener"
                 style="color:inherit;text-decoration:underline">ver recibo</a>` : ''}</div>`
        : `<button class="btn acento" type="submit">Marcar como pagado</button>`}

      <button class="btn suave" type="button" data-accion="editar-servicio"
              data-id="${s.pago_id}">Editar servicio</button>
      <button class="btn fantasma" type="button" data-accion="cerrar-hoja">Cerrar</button>
    </form>`);
}

const grupoValor = (form, grupo) =>
  form.querySelector(`[data-grupo="${grupo}"] [aria-pressed="true"]`)?.dataset.valor || null;

// --------------------------------------------------------------------- datos

async function cargar() {
  const p = estado.periodo;
  const [gastos, balance, total, resumen, lista, tareas, servicios] = await Promise.all([
    api.traerGastos(p), api.traerBalance(), api.traerTotalMes(p),
    api.traerResumenMes(p), api.traerLista(), api.traerTareas(),
    api.traerServicios(p),
  ].map((x) => x.catch(() => [])));
  estado.d = { gastos, balance, total, resumen, lista, tareas, servicios };
}

function pintar() {
  $('#cabecera').innerHTML = cabecera();
  $('#vista').innerHTML = { inicio: vInicio, gastos: vGastos, servicios: vServicios,
                            lista: vLista, tareas: vTareas }[estado.vista]();
  $('#tabbar').innerHTML = SECCIONES.map((s) => `
    <button data-accion="ir" data-vista="${s.id}"
            ${estado.vista === s.id ? 'aria-current="page"' : ''}>
      ${iconos[s.ic]}<span>${s.txt}</span></button>`).join('');
  const fab = $('#flotante');
  fab.hidden = !['gastos', 'servicios', 'tareas'].includes(estado.vista);
  fab.innerHTML = iconos.mas;
}

async function refrescar() {
  await cargar();
  pintar();
}

// ---------------------------------------------------------------------- cola

async function vaciarCola(avisar = false) {
  const items = await cola.pendientes();
  estado.enCola = items.length;
  if (!items.length) { $('#cabecera').innerHTML = cabecera(); return; }
  if (!navigator.onLine) return;

  let subidos = 0;
  for (const item of items) {
    try {
      const r = await api.guardarGasto(item.payload);
      await cola.sacar(item.client_uuid);
      subidos++;
      if (r.id && item.payload.foto) api.subirBoleta(r.id).catch(() => {});
    } catch (e) {
      await cola.anotarFallo(item, e.message);
    }
  }
  estado.enCola = await cola.contar();
  if (subidos) {
    if (avisar) brindis(`${subidos} gasto${subidos > 1 ? 's' : ''} sincronizado${subidos > 1 ? 's' : ''}`);
    await refrescar();
  } else {
    $('#cabecera').innerHTML = cabecera();
  }
}

// ------------------------------------------------------------------- eventos

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-accion]');
  if (!b) return;
  const { accion, id, vista } = b.dataset;

  if (accion === 'ir') { vibrar(); estado.vista = vista; pintar(); }

  if (accion === 'cerrar-hoja') cerrarHoja();

  if (accion === 'salir') {
    api.salir();
    localStorage.removeItem('nutria_usuario');
    cerrarHoja();
    pintarEntrar();
  }
  if (accion === 'cambiar-usuario') hojaUsuario();

  if (accion === 'elegir-usuario') {
    estado.usuario = estado.usuarios.find((u) => u.id === id);
    localStorage.setItem('nutria_usuario', id);
    cerrarHoja(); pintar();
  }

  if (accion === 'marcar-item') {
    vibrar();
    const marcada = b.dataset.marcada === '1';
    b.dataset.marcada = marcada ? '0' : '1';
    b.closest('.fila').classList.toggle('hecho', !marcada);
    try {
      await api.cambiarItem(id, {
        comprado: !marcada,
        comprado_por: !marcada ? estado.usuario.id : null,
      });
      await refrescar();
    } catch { brindis('No se pudo guardar'); }
  }

  if (accion === 'borrar-item') {
    vibrar();
    b.closest('.fila').style.opacity = '.3';
    try { await api.borrarItem(id); await refrescar(); }
    catch { brindis('No se pudo quitar'); }
  }

  if (accion === 'completar-tarea') {
    vibrar(14);
    b.dataset.marcada = '1';
    try {
      await api.completarTarea(id, estado.usuario.id);
      brindis('Hecho, le toca al otro');
      await refrescar();
    } catch { brindis('No se pudo completar'); }
  }

  if (accion === 'abrir-servicio' && id) { vibrar(); hojaPagar(id); }

  if (accion === 'editar-servicio') {
    const s = (estado.d.servicios || []).find((x) => x.pago_id === id);
    if (s) hojaServicio(s);
  }

  if (accion === 'registrar-compra') {
    const comprados = estado.d.lista.filter((i) => i.comprado);
    const cat = estado.categorias.find((c) => /supermercado/i.test(c.nombre));
    hojaGasto({
      categoria_id: cat?.id,
      descripcion: comprados.map((i) => i.nombre).join(', ').slice(0, 400),
    });
    $('#hoja').dataset.desdeLista = '1';
  }
});

$('#fondo-hoja').addEventListener('click', cerrarHoja);

$('#flotante').addEventListener('click', () => {
  vibrar();
  if (estado.vista === 'tareas') hojaTarea();
  else if (estado.vista === 'servicios') hojaServicio();
  else hojaGasto();
});

// Selección dentro de los grupos de pastillas
document.addEventListener('click', (ev) => {
  const p = ev.target.closest('.pastilla[data-valor]');
  if (!p) return;
  const grupo = p.closest('[data-grupo]');
  grupo.querySelectorAll('.pastilla')
    .forEach((o) => o.setAttribute('aria-pressed', String(o === p)));

  // El tipo manda: cambia las categorías disponibles y precarga el reparto.
  // Los botones de reparto siguen ahí para corregir un caso raro.
  if (grupo.dataset.grupo === 'tipo') {
    const cont = $('#pastillas-categoria');
    if (cont) cont.innerHTML = pastillasCategoria(p.dataset.valor);
    const reparto = p.dataset.reparto;
    document.querySelectorAll('[data-grupo="reparto_tipo"] .pastilla')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.valor === reparto)));
  }
});

// Foto: comprimir, mostrar y mandar a leer
document.addEventListener('change', async (ev) => {
  const inp = ev.target;
  if (inp.name !== 'foto' || !inp.files?.[0]) return;

  const zona = $('#zona-foto');
  const est = $('#estado-foto');
  try {
    const foto = await comprimir(inp.files[0]);
    estado.fotoPendiente = foto;
    zona.innerHTML = `<img src="data:image/jpeg;base64,${foto.base64}" alt="Boleta">`;

    est.innerHTML = `<div class="leyendo">
      <span class="girando">${iconos.destello}</span> Leyendo la boleta…</div>`;

    const r = await api.leerBoleta(foto);
    const d = r.datos || {};
    estado.lecturaIA = d;

    const form = document.querySelector('[data-form="gasto"]');
    if (d.monto_total) form.monto.value = Number(d.monto_total).toFixed(2);
    if (d.comercio) form.comercio.value = d.comercio;
    if (d.fecha && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) form.fecha_gasto.value = d.fecha;
    if (r.categoria_id) {
      form.querySelectorAll('[data-grupo="categoria"] .pastilla').forEach((p) =>
        p.setAttribute('aria-pressed', String(p.dataset.valor === r.categoria_id)));
    }
    const conf = Math.round((d.confianza ?? 0) * 100);
    est.innerHTML = `<div class="aviso ${conf >= 70 ? 'bueno' : 'info'}" style="margin-top:9px">
      ${iconos.destello} Leído con ${conf}% de confianza. Revisa antes de guardar.</div>`;
  } catch (e) {
    est.innerHTML = `<div class="aviso malo" style="margin-top:9px">
      ${iconos.cerrar} No se pudo leer: ${escapar(e.message)}. Llena los campos a mano.</div>`;
  }
});

// Recibo de servicio: se lee con Gemini y se guarda para subirlo al confirmar
document.addEventListener('change', async (ev) => {
  const inp = ev.target;
  if (inp.name !== 'recibo' || !inp.files?.[0]) return;

  const archivo = inp.files[0];
  const zona = $('#zona-recibo');
  const est  = $('#estado-recibo');

  try {
    // Los PDF van tal cual; las fotos se comprimen antes de viajar
    const datos = archivo.type.includes('pdf')
      ? await leerComoBase64(archivo)
      : await comprimir(archivo);
    estado.reciboPendiente = datos;

    zona.innerHTML = archivo.type.includes('pdf')
      ? `${iconos.recibo}<strong>${escapar(archivo.name)}</strong><small>PDF listo para subir</small>`
      : `<img src="data:image/jpeg;base64,${datos.base64}" alt="Recibo">`;

    est.innerHTML = `<div class="leyendo">
      <span class="girando">${iconos.destello}</span> Leyendo el recibo…</div>`;

    const r = await api.leerRecibo(datos);
    const d = r.datos || {};
    estado.lecturaIA = d;

    const form = document.querySelector('[data-form="pagar"]');
    if (d.monto_total) form.monto.value = Number(d.monto_total).toFixed(2);

    const conf = Math.round((d.confianza ?? 0) * 100);
    const extra = [
      d.fecha_vencimiento ? `vence ${d.fecha_vencimiento}` : '',
      d.consumo != null ? `${d.consumo} ${d.unidad_consumo || ''}` : '',
    ].filter(Boolean).join(' · ');
    est.innerHTML = `<div class="aviso ${conf >= 70 ? 'bueno' : 'info'}" style="margin-top:9px">
      ${iconos.destello} Leído con ${conf}% de confianza${extra ? ' · ' + escapar(extra) : ''}.
      Revisa el monto antes de confirmar.</div>`;
  } catch (e) {
    est.innerHTML = `<div class="aviso malo" style="margin-top:9px">
      ${iconos.cerrar} No se pudo leer: ${escapar(e.message)}. Pon el monto a mano.</div>`;
  }
});

// Formularios
document.addEventListener('submit', async (ev) => {
  const form = ev.target;
  ev.preventDefault();

  if (form.dataset.form === 'entrar') {
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      await api.entrar(form.email.value, form.password.value);
      await arrancar();
    } catch (e) {
      pintarEntrar(e.message);
    }
    return;
  }

  if (form.dataset.form === 'item') {
    const nombre = form.nombre.value.trim();
    if (!nombre) return;
    form.nombre.value = '';
    vibrar();
    try {
      await api.agregarItem({
        client_uuid: uuid(), nombre,
        agregado_por: estado.usuario.id,
        orden: estado.d.lista.length,
      });
      await refrescar();
    } catch { brindis('Sin conexión: no se agregó'); }
  }

  if (form.dataset.form === 'tarea') {
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await api.crearTarea({
        client_uuid: uuid(),
        titulo: form.titulo.value.trim(),
        frecuencia_dias: +form.frecuencia_dias.value,
        proxima_fecha: form.proxima_fecha.value,
        asignado_a: grupoValor(form, 'asignado_a'),
        icono: 'tarea',
        orden: estado.d.tareas.length + 10,
      });
      cerrarHoja(); brindis('Tarea creada'); await refrescar();
    } catch (e) { brindis('No se pudo crear'); btn.disabled = false; }
  }

  if (form.dataset.form === 'servicio') {
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    const datos = {
      nombre: form.nombre.value.trim(),
      categoria_id: grupoValor(form, 'categoria'),
      responsable_id: grupoValor(form, 'responsable_id'),
      dia_vencimiento: +form.dia_vencimiento.value,
      monto_estimado: form.monto_estimado.value ? +form.monto_estimado.value : null,
      proveedor: form.proveedor.value.trim() || null,
      numero_suministro: form.numero_suministro.value.replace(/\D/g, '') || null,
    };
    try {
      if (form.dataset.id) {
        await api.actualizarServicio(form.dataset.id, datos);
      } else {
        await api.crearServicio({ ...datos, orden: (estado.d.servicios || []).length + 1 });
        // Un servicio nuevo necesita su pago de este mes desde ya
        await api.generarPagos(estado.periodo).catch(() => {});
      }
      cerrarHoja(); brindis('Servicio guardado'); await refrescar();
    } catch (e) { brindis('No se pudo guardar'); btn.disabled = false; }
    return;
  }

  if (form.dataset.form === 'pagar') {
    const btn = form.querySelector('[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    const pagoId = form.dataset.id;
    const monto = +form.monto.value;
    const recibo = estado.reciboPendiente;
    const ocr = estado.lecturaIA;

    try {
      // El monto se guarda ANTES de subir el archivo: el nombre del PDF en
      // Drive lo lleva dentro, y con el estimado saldria equivocado.
      await api.guardarComprobante(pagoId, { monto });
      if (recibo) await api.guardarRecibo(pagoId, recibo, ocr).catch(() => {});
      await api.pagarServicio(
        pagoId, estado.usuario.id, monto,
        form.fecha.value || hoy(), grupoValor(form, 'pagado_por'),
      );
      cerrarHoja(); brindis('Pagado y registrado'); await refrescar();
    } catch (e) {
      brindis('No se pudo registrar el pago');
      if (btn) { btn.disabled = false; btn.textContent = 'Marcar como pagado'; }
    }
    return;
  }

  if (form.dataset.form === 'gasto') {
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;

    const payload = {
      client_uuid: uuid(),
      registrado_por: estado.usuario.id,
      pagado_por: grupoValor(form, 'pagado_por'),
      categoria_id: grupoValor(form, 'categoria'),
      monto: +form.monto.value,
      comercio: form.comercio.value.trim() || null,
      descripcion: form.descripcion.value.trim() || null,
      fecha_gasto: form.fecha_gasto.value || hoy(),
      reparto_tipo: grupoValor(form, 'reparto_tipo'),
      foto: estado.fotoPendiente || undefined,
    };
    const desdeLista = $('#hoja').dataset.desdeLista === '1';
    cerrarHoja();

    try {
      const r = await api.guardarGasto(payload);
      brindis('Gasto guardado');
      if (r.id && payload.foto) api.subirBoleta(r.id).catch(() => {});
      if (desdeLista) await api.borrarComprados().catch(() => {});
    } catch {
      // Sin señal: a la cola, y se sube solo cuando vuelva
      await cola.encolar({ client_uuid: payload.client_uuid, payload, intentos: 0 });
      estado.enCola = await cola.contar();
      brindis('Sin conexión: guardado en la cola');
    }
    $('#hoja').dataset.desdeLista = '0';
    await refrescar();
  }
});

window.addEventListener('online', () => vaciarCola(true));
setInterval(() => vaciarCola(false), REINTENTO_MS);

// --------------------------------------------------------------------- arranque

async function arrancar() {
  if (!api.haySesion()) { pintarEntrar(); return; }

  try {
    [estado.usuarios, estado.categorias, estado.tipos] = await Promise.all([
      api.traerUsuarios(), api.traerCategorias(), api.traerTipos(),
    ]);
  } catch (e) {
    // Un 401 es sesión vencida; cualquier otra cosa, falta de red
    if (String(e.message).startsWith('401')) {
      api.salir();
      pintarEntrar('Tu sesión venció. Entra otra vez.');
      return;
    }
    $('#vista').innerHTML = `<div class="vacio">${nutriaDormida(72)}
      <strong>Sin conexión</strong>
      <p>Abre la app con señal la primera vez para descargar los datos.</p></div>`;
    return;
  }

  // Sin usuarios visibles la sesión no sirve de nada: las políticas la rechazan
  if (!estado.usuarios.length) {
    api.salir();
    pintarEntrar('Esa cuenta no tiene acceso. Revisa el correo y la contraseña.');
    return;
  }

  const guardado = localStorage.getItem('nutria_usuario');
  estado.usuario = estado.usuarios.find((u) => u.id === guardado) || null;

  estado.enCola = await cola.contar();
  await refrescar();
  if (!estado.usuario) hojaUsuario();
  vaciarCola(false);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

arrancar();
