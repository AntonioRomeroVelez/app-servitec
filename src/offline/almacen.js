// Almacenamiento local (IndexedDB) para el modo sin conexión.
//  - cola:     cambios hechos sin conexión, pendientes de enviar (en orden).
//  - lecturas: últimas respuestas del servidor, para poder mostrarlas sin conexión.
// Si IndexedDB no está disponible (p. ej. navegación privada en algunos navegadores) todo degrada a "no hay nada guardado".
const NOMBRE = 'ferisel-offline'
let abierta = null

function abrir() {
  if (!abierta) {
    abierta = new Promise((resolver, rechazar) => {
      if (typeof indexedDB === 'undefined') return rechazar(new Error('IndexedDB no disponible'))
      const r = indexedDB.open(NOMBRE, 1)
      r.onupgradeneeded = () => {
        r.result.createObjectStore('cola', { keyPath: 'n', autoIncrement: true })
        r.result.createObjectStore('lecturas', { keyPath: 'clave' })
      }
      r.onsuccess = () => resolver(r.result)
      r.onerror = () => rechazar(r.error)
    })
    abierta.catch(() => {}) // el error se maneja en cada operación
  }
  return abierta
}

// Ejecuta fn(store) dentro de una transacción y devuelve lo que fn deje en `resultado`
async function operar(almacen, modo, fn) {
  const db = await abrir()
  return new Promise((resolver, rechazar) => {
    const t = db.transaction(almacen, modo)
    const ref = { resultado: undefined }
    fn(t.objectStore(almacen), ref)
    t.oncomplete = () => resolver(ref.resultado)
    t.onerror = () => rechazar(t.error)
    t.onabort = () => rechazar(t.error)
  })
}

const seguro = (fn, porDefecto) => async (...args) => {
  try {
    return await fn(...args)
  } catch {
    return porDefecto
  }
}

// ---------- Cola de cambios pendientes ----------
// op = { action, payload, usuarioId, usuario, creado, estado: 'pendiente'|'fallida', error? }

export async function encolar(op) {
  return operar('cola', 'readwrite', (s, ref) => {
    const r = s.add({ ...op })
    r.onsuccess = () => (ref.resultado = r.result)
  })
}

export const cola = seguro(async (usuarioId) => {
  const todas = await operar('cola', 'readonly', (s, ref) => {
    const r = s.getAll()
    r.onsuccess = () => (ref.resultado = r.result)
  })
  return (todas || []).filter((o) => o.usuarioId === usuarioId).sort((a, b) => a.n - b.n)
}, [])

export const actualizarOp = seguro(
  (n, parche) =>
    operar('cola', 'readwrite', (s) => {
      const r = s.get(n)
      r.onsuccess = () => r.result && s.put({ ...r.result, ...parche })
    }),
  undefined,
)

export const quitarOp = seguro((n) => operar('cola', 'readwrite', (s) => s.delete(n)), undefined)

// ---------- Lecturas guardadas ----------

export const guardarLectura = seguro(
  (clave, data, tipo) => operar('lecturas', 'readwrite', (s) => s.put({ clave, data, tipo, guardado: Date.now() })),
  undefined,
)

export const leerLectura = seguro(
  (clave) =>
    operar('lecturas', 'readonly', (s, ref) => {
      const r = s.get(clave)
      r.onsuccess = () => (ref.resultado = r.result)
    }),
  undefined,
)

// Conserva solo las `max` más recientes de un tipo (las fotos completas pesan; no se guardan sin límite)
export const recortarLecturas = seguro(async (tipo, max) => {
  const todas = await operar('lecturas', 'readonly', (s, ref) => {
    const r = s.getAll()
    r.onsuccess = () => (ref.resultado = r.result)
  })
  const delTipo = (todas || []).filter((l) => l.tipo === tipo).sort((a, b) => b.guardado - a.guardado)
  if (delTipo.length <= max) return
  await operar('lecturas', 'readwrite', (s) => delTipo.slice(max).forEach((l) => s.delete(l.clave)))
}, undefined)

// Al cerrar sesión se borran los datos guardados (pueden ser de clientes); la cola de pendientes se conserva
export const limpiarLecturas = seguro(() => operar('lecturas', 'readwrite', (s) => s.clear()), undefined)
