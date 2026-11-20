// Prueba el servicio de fotos (apps-script-fotos/Code.gs) con un Drive simulado en memoria, contra el Supabase local real
// (base, RLS y transporte reales). Solo Drive y UrlFetchApp están simulados.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { crearTransporte } from '../../src/supabase/transporte.js'
import { prepararPlataforma, crearEmpresaConAdmin, crearUsuario, cedulaDe } from './ayudas.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(readFileSync(join(aqui, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)))
const URL_API = `http://localhost:${env.PUERTO_API}`

// ---------------- Drive simulado ----------------
const carpetas = new Map()
const archivos = new Map()
let n = 0
const iter = (arr) => {
  let i = 0
  return { hasNext: () => i < arr.length, next: () => arr[i++] }
}
class Carpeta {
  constructor(nombre, padre) {
    this.id = `carpeta${++n}`
    this.nombre = nombre
    this.padre = padre
    this.papelera = false
    carpetas.set(this.id, this)
  }
  getId() { return this.id }
  isTrashed() { return this.papelera }
  getParents() { return iter(this.padre ? [this.padre] : []) }
  getFoldersByName(nom) { return iter([...carpetas.values()].filter((c) => c.padre === this && c.nombre === nom && !c.papelera)) }
  createFolder(nom) { return new Carpeta(nom, this) }
  createFile(blob) {
    const f = { id: `archivo${++n}`, nombre: blob.nombre, bytes: blob.bytes, carpeta: this, papelera: false }
    archivos.set(f.id, f)
    return { getId: () => f.id, setTrashed: (v) => (f.papelera = v) }
  }
  ruta() { return (this.padre ? this.padre.ruta() + '/' : '') + this.nombre }
}
const DriveApp = {
  getFolderById: (id) => {
    if (!carpetas.has(id)) throw new Error('Carpeta no encontrada')
    return carpetas.get(id)
  },
  getFoldersByName: (nom) => iter([...carpetas.values()].filter((c) => !c.padre && c.nombre === nom)),
  createFolder: (nom) => new Carpeta(nom, null),
  getFileById: (id) => {
    const f = archivos.get(id)
    if (!f) throw new Error('Archivo no encontrado')
    return { getBlob: () => ({ getBytes: () => f.bytes }), setTrashed: (v) => (f.papelera = v) }
  },
}

// ---------------- Resto de servicios de Apps Script ----------------
const propiedades = new Map([['SUPABASE_URL', URL_API], ['SUPABASE_ANON_KEY', env.ANON_KEY]])
const UrlFetchApp = {
  // HTTP síncrono (Apps Script lo es): se hace en un proceso hijo
  fetch(url, op) {
    const r = spawnSync(process.execPath, ['-e', `
      let t = ''; process.stdin.on('data', (d) => (t += d)).on('end', async () => {
        const { url, op } = JSON.parse(t)
        const res = await fetch(url, { method: op.method, headers: { ...op.headers, 'content-type': op.contentType }, body: op.payload })
        process.stdout.write(JSON.stringify({ code: res.status, text: await res.text() }))
      })`], { input: JSON.stringify({ url, op }), encoding: 'utf8' })
    const { code, text } = JSON.parse(r.stdout)
    return { getResponseCode: () => code, getContentText: () => text }
  },
}
const Utilities = {
  base64Decode: (s) => Buffer.from(s, 'base64'),
  base64Encode: (b) => Buffer.from(b).toString('base64'),
  newBlob: (bytes, tipo, nombre) => ({ bytes, tipo, nombre }),
}
const ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType() { return this }, getContent: () => s }) }
const PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => propiedades.get(k) ?? null, setProperty: (k, v) => propiedades.set(k, v) }) }

const contexto = vm.createContext({ DriveApp, UrlFetchApp, Utilities, ContentService, PropertiesService, JSON, String, Error, encodeURIComponent, console })
vm.runInContext(readFileSync(join(aqui, '..', '..', 'apps-script-fotos', 'Code.gs'), 'utf8'), contexto)
const llamarFotos = (cuerpo) => {
  const salida = JSON.parse(contexto.doPost({ postData: { contents: JSON.stringify(cuerpo) } }).getContent())
  if (!salida.ok) throw Object.assign(new Error(salida.error), { code: salida.code })
  return salida.data
}

// ---------------- Pruebas ----------------
const memoria = () => {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }
}
const nuevo = () => crearTransporte({ url: URL_API, anonKey: env.ANON_KEY, storage: memoria(), llamarFotos })
let fallos = 0
const ok = (c, m, extra) => (c ? console.log('OK:', m) : (fallos++, console.log('FALLO:', m, extra ?? '')))
const rechaza = async (fn, msg, patron) => {
  try {
    await fn()
    ok(false, `${msg} (no falló)`)
  } catch (e) {
    ok(patron.test(e.message), `${msg} -> "${e.message}"`)
  }
}
const sql = (q) => spawnSync('docker', ['compose', '-f', join(aqui, 'docker-compose.yml'), '--env-file', join(aqui, '.env'), 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-qAt', '-c', q], { encoding: 'utf8' }).stdout.trim()

const sufijo = Date.now()
const A = nuevo()
const B = nuevo()
const T = nuevo()
const P = nuevo()
const clave = 'ClaveSegura123'
await prepararPlataforma(P, sufijo)
await crearEmpresaConAdmin(P, A, { empresa: 'Seguridad Norte', nombre: 'Ana Fotos Pérez', clave })
await crearEmpresaConAdmin(P, B, { empresa: 'Otra Empresa', nombre: 'Beto Fotos Ríos', clave })
const tec = await crearUsuario(A, 'Técnico Fotos Gómez', 'tecnico', 1)
await T.call('login', { usuario: tec.usuario, clave: cedulaDe(1) })
await T.call('cambiar_clave', { actual: cedulaDe(1), nueva: 'NuevaClave12345' })
const v = await A.call('visitas_create', { data: { fecha: '2026-11-21', hora: '09:00', cliente: 'Ferretería Sol', tipo: 'Inspección', responsable: tec.usuario } })

const jpeg = (txt) => Buffer.from(`JPEG-${txt}`).toString('base64')
await rechaza(() => T.call('fotos_upload', { id: crypto.randomUUID(), visitaId: v.id, imagen: jpeg('a'), mini: 'm' }), 'el técnico no sube fotos sin aceptar la visita', /Acepta la visita/)
await T.call('visitas_update', { id: v.id, data: { estado: 'Aceptada' } })

const id1 = crypto.randomUUID()
const f1 = await T.call('fotos_upload', { id: id1, visitaId: v.id, imagen: jpeg('uno'), mini: 'mini1' })
ok(f1.id === id1 && f1.autor === tec.usuario && f1.visitaId === v.id && f1.mini === 'mini1', 'fotos_upload devuelve la foto con autor por nombre de usuario', JSON.stringify(f1))
const archivo1 = [...archivos.values()][0]
const mes = sql(`select mes from fotos where id = '${id1}'`)
ok(/^\d{4}-\d{2}$/.test(mes) && archivo1.carpeta.ruta() === `ServiTec Fotos/${[...carpetas.values()].find((c) => c.nombre.startsWith('Seguridad Norte')).nombre}/${tec.usuario}/${mes}`, `el archivo quedó en empresa/usuario/mes: ${archivo1.carpeta.ruta()}`)

const nCarpetas = carpetas.size
await T.call('fotos_upload', { id: crypto.randomUUID(), visitaId: v.id, imagen: jpeg('dos'), mini: 'mini2' })
ok(carpetas.size === nCarpetas && archivos.size === 2, 'la segunda foto reutiliza las carpetas')
await T.call('fotos_upload', { id: id1, visitaId: v.id, imagen: jpeg('uno'), mini: 'mini1' })
ok(archivos.size === 2, 'repetir la subida con el mismo id no duplica el archivo')

ok((await T.call('fotos_list', { visitaId: v.id })).length === 2, 'fotos_list muestra las 2 fotos')
ok((await A.call('fotos_get', { id: id1 })).dataUrl === `data:image/jpeg;base64,${jpeg('uno')}`, 'el admin obtiene el archivo completo desde Drive')
await rechaza(() => B.call('fotos_get', { id: id1 }), 'otra empresa no ve la foto', /no encontrada/i)
await rechaza(() => B.call('fotos_upload', { id: crypto.randomUUID(), visitaId: v.id, imagen: jpeg('x'), mini: '' }), 'otra empresa no sube a esta visita', /Visita no encontrada/)

// Un id de carpeta ajeno escrito en el perfil no desvía la subida
const ajena = DriveApp.createFolder('Carpeta personal del dueño')
await T.cliente.rpc('guardar_carpeta_drive', { p_nivel: 'usuario', p_drive_id: ajena.getId() })
await T.call('fotos_upload', { id: crypto.randomUUID(), visitaId: v.id, imagen: jpeg('tres'), mini: '' })
ok([...archivos.values()].every((a) => a.carpeta !== ajena) && archivos.size === 3, 'una carpeta ajena registrada en el perfil se ignora')

// Límite de 25 fotos por visita (se rellenan 22 filas directo en la base)
sql(`alter table fotos disable trigger user; insert into fotos (empresa_id, visita_id, drive_id, nombre, mes) select empresa_id, id, 'x' || g, 'x', '2026-11' from visitas, generate_series(1, 22) g where id = '${v.id}'; alter table fotos enable trigger user`)
ok(sql(`select count(*) from fotos where visita_id = '${v.id}'`) === '25', 'la visita llegó a 25 fotos')
await rechaza(() => T.call('fotos_upload', { id: crypto.randomUUID(), visitaId: v.id, imagen: jpeg('limite'), mini: '' }), 'máximo 25 fotos por visita', /Máximo 25/)
ok([...archivos.values()].filter((a) => !a.papelera).length === 3, 'una foto rechazada no deja archivo huérfano en Drive')
sql(`delete from fotos where drive_id like 'x%'`)

// Borrado
await T.call('fotos_delete', { id: id1 })
ok(archivo1.papelera && (await T.call('fotos_list', { visitaId: v.id })).length === 2, 'fotos_delete manda el archivo a la papelera y quita la fila')
await T.call('visitas_update', { id: v.id, data: { estado: 'En curso' } })
await rechaza(() => T.call('visitas_delete', { id: v.id }), 'el técnico no elimina visitas', /No encontrado|permisos/i)
await A.call('visitas_delete', { id: v.id })
ok([...archivos.values()].every((a) => a.papelera), 'al eliminar la visita todas sus fotos van a la papelera de Drive')
ok(sql(`select count(*) from fotos where visita_id = '${v.id}'`) === '0', 'y sus filas desaparecen de la base')

console.log(fallos ? `${fallos} fallos` : 'Todo correcto')
process.exit(fallos ? 1 : 0)
