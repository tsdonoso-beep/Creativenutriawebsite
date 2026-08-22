import * as api from './api.js';
import * as cola from './cola.js';
import { iconos, nutria, nutriaDormida } from './iconos.js';
import { REINTENTO_MS } from './config.js';

// ---------------------------------------------------------------- utilidades

const $ = (s) => document.querySelector(s);
const hoy = () => new Date().toISOString().slice(0, 10);
const periodoDe = (f) => f.slice(0, 7);

const nf = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plata = (n) => nf.format(Number(n || 0));
const soles = (n) => `<span class="moneda">S/</span> ${plata(n)}`;

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
  d: { gastos: [], balance: [], total: [], resumen: [], lista: [], tareas: [] },
  enCola: 0,
  cargando: true,
  fotoPendiente: null,
  lecturaIA: null,
};

const SECCIONES = [
  { id: 'inicio', txt: 'Inicio',  ic: 'casa' },
  { id: 'gastos', txt: 'Gastos',  ic: 'recibo' },
  { id: 'lista',  txt: 'Lista',   ic: 'carrito' },
  { id: 'tareas', txt: 'Tareas',  ic: 'escoba' },
];

// -------------------------------------------------------------------- vistas

function cabecera() {
  const nom = estado.usuario?.nombre?.split(' ')[0] || '';
  const h = new Date().getHours();
  const saludo = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días'
                : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  const titulos = {
    inicio: `${saludo},<br><span class="suave">${escapar(nom)}</span>`,
    gastos: `Gastos de<br><span class="suave">${mesLargo(estado.periodo)}</span>`,
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
  const { balance, total, lista, tareas } = estado.d;
  const yo = balance.find((b) => b.usuario_id === estado.usuario.id);
  const saldo = Number(yo?.saldo || 0);
  const otro = balance.find((b) => b.usuario_id !== estado.usuario.id);

  const frase = Math.abs(saldo) < 0.01
    ? 'Están a mano'
    : saldo > 0
      ? `${escapar(otro?.nombre || 'Te')} te debe`
      : `Le debes a ${escapar(otro?.nombre || '')}`;

  const gastadoMes = Number(total?.[0]?.total_pen || 0);
  const pendientes = lista.filter((i) => !i.comprado);
  const urgentes = tareas.filter((t) => t.dias_restantes <= 0);
  const mias = tareas.filter((t) => t.asignado_a === estado.usuario.id && t.dias_restantes <= 1);

  return `
  <div class="deslizar-entrada">
    <div class="tarjeta">
      <div class="tarjeta-cab">
        <span class="chapa verde">${iconos.balanza}</span>
        <h2>Balance</h2>
      </div>
      <div class="monto-grande ${Math.abs(saldo) < 0.01 ? '' : saldo > 0 ? 'positivo' : 'negativo'}">
        ${soles(Math.abs(saldo))}
      </div>
      <div class="fila-sub" style="margin-top:2px">${frase}</div>
      <div class="fila" style="margin-top:12px;border-top:1px solid var(--linea)">
        <div class="fila-txt">
          <div class="fila-sub">Gastado en ${mesLargo(estado.periodo)}</div>
        </div>
        <div class="fila-val">${soles(gastadoMes)}</div>
      </div>
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
    </div>`);
}

function hojaGasto(prefill = {}) {
  const cats = estado.categorias;
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
        <label>Categoría</label>
        <div class="pastillas" data-grupo="categoria">
          ${cats.map((c, i) => `
            <button type="button" class="pastilla" data-valor="${c.id}"
              aria-pressed="${prefill.categoria_id ? prefill.categoria_id === c.id : i === 0}">
              ${escapar(c.nombre)}</button>`).join('')}
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
          <button type="button" class="pastilla" data-valor="default" aria-pressed="true">60/40</button>
          <button type="button" class="pastilla" data-valor="igual">Mitad y mitad</button>
          <button type="button" class="pastilla" data-valor="personal">Solo mío</button>
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

const grupoValor = (form, grupo) =>
  form.querySelector(`[data-grupo="${grupo}"] [aria-pressed="true"]`)?.dataset.valor || null;

// --------------------------------------------------------------------- datos

async function cargar() {
  const p = estado.periodo;
  const [gastos, balance, total, resumen, lista, tareas] = await Promise.all([
    api.traerGastos(p), api.traerBalance(), api.traerTotalMes(p),
    api.traerResumenMes(p), api.traerLista(), api.traerTareas(),
  ].map((x) => x.catch(() => [])));
  estado.d = { gastos, balance, total, resumen, lista, tareas };
}

function pintar() {
  $('#cabecera').innerHTML = cabecera();
  $('#vista').innerHTML = { inicio: vInicio, gastos: vGastos, lista: vLista, tareas: vTareas }[estado.vista]();
  $('#tabbar').innerHTML = SECCIONES.map((s) => `
    <button data-accion="ir" data-vista="${s.id}"
            ${estado.vista === s.id ? 'aria-current="page"' : ''}>
      ${iconos[s.ic]}<span>${s.txt}</span></button>`).join('');
  const fab = $('#flotante');
  fab.hidden = !['inicio', 'gastos', 'tareas'].includes(estado.vista);
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
  else hojaGasto();
});

// Selección dentro de los grupos de pastillas
document.addEventListener('click', (ev) => {
  const p = ev.target.closest('.pastilla[data-valor]');
  if (!p) return;
  p.closest('[data-grupo]').querySelectorAll('.pastilla')
    .forEach((o) => o.setAttribute('aria-pressed', String(o === p)));
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

// Formularios
document.addEventListener('submit', async (ev) => {
  const form = ev.target;
  ev.preventDefault();

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
  try {
    [estado.usuarios, estado.categorias] = await Promise.all([
      api.traerUsuarios(), api.traerCategorias(),
    ]);
  } catch {
    $('#vista').innerHTML = `<div class="vacio">${nutriaDormida(72)}
      <strong>Sin conexión</strong>
      <p>Abre la app con señal la primera vez para descargar los datos.</p></div>`;
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
