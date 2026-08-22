// Cola offline en IndexedDB.
//
// Un gasto registrado sin señal se guarda aquí y se sube cuando vuelve la
// conexión. La clave del asunto es el client_uuid: se genera ANTES de encolar,
// así que si la petición se pierde por timeout y reintentamos, el servidor
// reconoce el duplicado y no crea dos gastos.

const BD = 'nutria-app';
const TIENDA = 'cola';

function abrir() {
  return new Promise((ok, mal) => {
    const p = indexedDB.open(BD, 1);
    p.onupgradeneeded = () => {
      const db = p.result;
      if (!db.objectStoreNames.contains(TIENDA)) {
        db.createObjectStore(TIENDA, { keyPath: 'client_uuid' });
      }
    };
    p.onsuccess = () => ok(p.result);
    p.onerror = () => mal(p.error);
  });
}

async function conTienda(modo, accion) {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const tx = db.transaction(TIENDA, modo);
    const req = accion(tx.objectStore(TIENDA));
    tx.oncomplete = () => { db.close(); ok(req?.result); };
    tx.onerror = () => { db.close(); mal(tx.error); };
  });
}

export const encolar   = (item) => conTienda('readwrite', (t) => t.put(item));
export const pendientes = ()    => conTienda('readonly',  (t) => t.getAll());
export const sacar     = (id)   => conTienda('readwrite', (t) => t.delete(id));

export async function contar() {
  const todos = await pendientes();
  return todos.length;
}

/** Marca un intento fallido sin sacarlo de la cola. */
export async function anotarFallo(item, error) {
  item.intentos = (item.intentos || 0) + 1;
  item.error = String(error).slice(0, 200);
  item.ultimo_intento = Date.now();
  await encolar(item);
}
