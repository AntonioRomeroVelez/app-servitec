// Simulador mínimo de Google Apps Script para probar apps-script/Code.gs en Node (sin tocar Google).
// Sirve para verificar lógica (permisos, login, paginación) y contar cuántas celdas lee cada petición.
// No reproduce la latencia real de Sheets/Drive: es una prueba de lógica, no de rendimiento absoluto.
import vm from 'node:vm'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const CODIGO = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'Code.gs'), 'utf8')

const aSigned = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b))
const aBuffer = (bytes) => Buffer.from(bytes.map((b) => b & 0xff))

// Como Sheets: un apóstrofo inicial solo indica "es texto" y no forma parte del valor
const comoSheets = (v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v)

class Hoja {
  constructor(nombre, stats) {
    this.nombre = nombre
    this.filas = []
    this.formatos = {}
    this.stats = stats
  }
  getLastRow() {
    return this.filas.length
  }
  getLastColumn() {
    return this.filas.reduce((m, f) => Math.max(m, f.length), 0)
  }
  getMaxRows() {
    return Math.max(1000, this.filas.length, this.maximo || 0)
  }
  insertRowsAfter(_desde, cantidad) {
    this.maximo = this.getMaxRows() + cantidad
  }
  appendRow(r) {
    this.filas.push(r.map(comoSheets))
    this.stats.escrituras++
  }
  setFrozenRows() {}
  deleteRow(n) {
    this.filas.splice(n - 1, 1)
    this.stats.escrituras++
  }
  deleteRows(desde, cantidad) {
    this.filas.splice(desde - 1, cantidad)
    this.stats.escrituras++
  }
  getRange(r, c, nr = 1, nc = 1) {
    const h = this
    // Como Sheets: no se puede salir de las filas que tiene la hoja
    if (r + nr - 1 > h.getMaxRows()) throw new Error(`Rango fuera de la hoja ${h.nombre}`)
    return {
      getValues() {
        h.stats.lecturas++
        h.stats.celdasLeidas += nr * nc
        const out = []
        for (let i = 0; i < nr; i++) {
          const fila = h.filas[r - 1 + i] || []
          const valores = Array.from({ length: nc }, (_, j) => fila[c - 1 + j] ?? '')
          for (const v of valores) if (typeof v === 'string') h.stats.caracteres += v.length
          out.push(valores)
        }
        return out
      },
      setValues(v) {
        h.stats.escrituras++
        v.forEach((fila, i) => {
          const idx = r - 1 + i
          h.filas[idx] = h.filas[idx] || []
          fila.forEach((x, j) => (h.filas[idx][c - 1 + j] = comoSheets(x)))
        })
      },
      setValue(v) {
        this.setValues([[v]])
      },
      setNumberFormat(f) {
        h.formatos[c] = f // formato de la columna c (para comprobar 19-11-2026 14:13)
        return this
      },
    }
  }
}

function crearDrive() {
  let n = 0
  const raices = []
  const carpetas = new Map()
  const archivos = new Map()
  const iter = (arr) => {
    let i = 0
    return { hasNext: () => i < arr.length, next: () => arr[i++] }
  }
  function nuevaCarpeta(nombre, padre) {
    const id = `F${++n}`
    const c = {
      id,
      nombre,
      hijos: [],
      archivos: [],
      papelera: false,
      getId: () => id,
      getName: () => c.nombre,
      setName: (x) => (c.nombre = x),
      isTrashed: () => c.papelera,
      getFolders: () => iter(c.hijos),
      getFoldersByName: (x) => iter(c.hijos.filter((h) => h.nombre === x)),
      createFolder: (x) => nuevaCarpeta(x, c),
      createFile: (blob) => {
        const fid = `A${++n}`
        const a = { id: fid, nombre: blob.nombre, bytes: blob.getBytes(), papelera: false, getId: () => fid, getBlob: () => ({ getBytes: () => a.bytes }), setTrashed: (v) => (a.papelera = v) }
        archivos.set(fid, a)
        c.archivos.push(a)
        return a
      },
    }
    carpetas.set(id, c)
    ;(padre ? padre.hijos : raices).push(c)
    return c
  }
  const hojasDeCalculo = new Map() // id -> archivo de Drive de cada hoja de cálculo creada
  return {
    raices,
    archivos,
    hojasDeCalculo,
    DriveApp: {
      createFolder: (x) => nuevaCarpeta(x, null),
      getFoldersByName: (x) => iter(raices.filter((c) => c.nombre === x)),
      getFolderById: (id) => carpetas.get(id) || (() => { throw new Error('Carpeta no existe') })(),
      getFileById: (id) => hojasDeCalculo.get(id) || archivos.get(id) || (() => { throw new Error('Archivo no existe') })(),
    },
  }
}

export function crearEntorno() {
  const stats = { lecturas: 0, celdasLeidas: 0, caracteres: 0, escrituras: 0, bloqueos: 0 }
  const libros = new Map() // id -> hoja de cálculo; 'principal' es la que tiene el script
  function nuevoLibro(id, nombre, conPestana) {
    const hojas = new Map()
    const libro = {
      nombre,
      hojas,
      getId: () => id,
      setSpreadsheetTimeZone: (tz) => (zona.tz = tz),
      getSheetByName: (n) => hojas.get(n) || null,
      getSheets: () => [...hojas.values()],
      deleteSheet: (h) => hojas.delete(h.nombre),
      insertSheet: (n) => {
        const h = new Hoja(n, stats)
        hojas.set(n, h)
        return h
      },
    }
    libros.set(id, libro)
    if (conPestana) libro.insertSheet('Hoja 1')
    return libro
  }
  const props = new Map()
  const cacheMapa = new Map()
  let reloj = 0 // segundos simulados, para expirar el caché y los bloqueos
  let lockTomado = false
  const drive = crearDrive()
  const correos = [] // correos enviados: { to, subject, htmlBody, conLock }
  const config = { cuotaCorreo: 100, fallaCorreo: false }
  const triggers = []
  const logs = [] // Logger.log del script
  const zona = { tz: null } // zona horaria que el script fija en la hoja

  const fmt = (d, f) => {
    const p = (n) => String(n).padStart(2, '0')
    return f
      .replace("yyyy-MM-dd'T'HH:mm:ss", `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`)
      .replace('yyyy-MM-dd', `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
      .replace('HH:mm', `${p(d.getHours())}:${p(d.getMinutes())}`)
      .replace('yyyy', String(d.getFullYear()))
  }

  const principal = nuevoLibro('principal', 'Principal', false)
  const GLOBALES = ['Usuarios', 'Empresas']
  /** Hoja de la empresa indicada (por id) o de la primera; Usuarios y Empresas están en la principal. */
  function hojaDe(nombre, empresaId) {
    const empresas = principal.getSheetByName('Empresas')?.filas.slice(1) || []
    const fila = empresaId ? empresas.find((f) => f[0] === empresaId) : empresas[0]
    const libro = GLOBALES.includes(nombre) || !fila ? principal : libros.get(fila[8])
    return libro.getSheetByName(nombre)
  }

  const ctx = {
    console,
    Logger: { log: (m) => logs.push(String(m)) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => principal,
      openById: (id) => libros.get(id) || (() => { throw new Error('La hoja de cálculo no existe') })(),
      create: (nombre) => {
        const libro = nuevoLibro(`S${libros.size}`, nombre, true)
        const archivo = { nombre, carpeta: null, moveTo: (c) => (archivo.carpeta = c), setName: (x) => (archivo.nombre = x) }
        drive.hojasDeCalculo.set(libro.getId(), archivo)
        return libro
      },
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (_alg, v) => aSigned(crypto.createHash('sha256').update(typeof v === 'string' ? Buffer.from(v, 'utf8') : aBuffer(v)).digest()),
      newBlob: (datos, mime, nombre) => ({ nombre, mime, getBytes: () => (typeof datos === 'string' ? aSigned(Buffer.from(datos, 'utf8')) : datos) }),
      base64Decode: (s) => aSigned(Buffer.from(s, 'base64')),
      base64Encode: (bytes) => aBuffer(bytes).toString('base64'),
      formatDate: (d, _tz, f) => fmt(d, f),
      sleep: () => {},
    },
    Session: { getScriptTimeZone: () => 'America/Guayaquil' },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => {
          const e = cacheMapa.get(k)
          return e && e.expira > reloj ? e.valor : null
        },
        put: (k, v, ttl = 600) => cacheMapa.set(k, { valor: String(v), expira: reloj + ttl }),
        remove: (k) => cacheMapa.delete(k),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {
          if (lockTomado) throw new Error('Lock tomado dos veces en la misma ejecución')
          lockTomado = true
          stats.bloqueos++
        },
        releaseLock: () => (lockTomado = false),
      }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) }) },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (s) => ({ contenido: s, setMimeType() { return this } }) },
    DriveApp: drive.DriveApp,
    MailApp: {
      getRemainingDailyQuota: () => config.cuotaCorreo,
      sendEmail: (m) => {
        if (config.fallaCorreo) throw new Error('El servicio de correo falló')
        correos.push({ ...m, conLock: lockTomado }) // conLock: ¿se envió con el lock tomado? (no debería)
      },
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.fn, _t: t })),
      deleteTrigger: (h) => {
        const i = triggers.indexOf(h._t)
        if (i >= 0) triggers.splice(i, 1)
      },
      newTrigger: (fn) => {
        const t = { fn }
        const b = {
          timeBased: () => b,
          everyDays: (n) => ((t.cadaDias = n), b),
          atHour: (h) => ((t.hora = h), b),
          create: () => (triggers.push(t), t),
        }
        return b
      },
    },
  }
  vm.createContext(ctx)
  vm.runInContext(`${CODIGO}\n;globalThis.__gs = { doPost, doGet, enviarRecordatorios, limpiarNotificaciones, instalarTriggers, crearSuperadmin, diagnosticoUsuarios, registrarClientesExistentes, aplicarFormatos, tablas: { VISITAS, INFORMES, FOTOS, USUARIOS, NOTIFICACIONES, CLIENTES, BITACORA, EMPRESAS } }`, ctx)

  /** Llama al backend como lo haría el frontend. Devuelve { ok, data|error, code } ya parseado. */
  function llamar(action, payload = {}, token) {
    const salida = ctx.__gs.doPost({ postData: { contents: JSON.stringify({ action, token, ...payload }) } })
    return JSON.parse(salida.contenido)
  }

  /** POST "crudo" (texto JSON de entrada y de salida), como lo vería un cliente HTTP */
  const crudo = (contenido) => ctx.__gs.doPost({ postData: { contents: contenido } }).contenido

  return {
    llamar,
    crudo,
    correos,
    logs,
    propiedades: props, // PropertiesService.getScriptProperties()
    zona,
    config,
    triggers,
    /** Ejecuta una función del editor por nombre (enviarRecordatorios, limpiarNotificaciones, instalarTriggers, crearSuperadmin) */
    ejecutar: (nombre) => ctx.__gs[nombre](),
    stats,
    drive,
    tablas: ctx.__gs.tablas,
    hoja: hojaDe,
    principal, // la hoja de cálculo que tiene el script
    libros,
    /** Avanza el reloj simulado (expira bloqueos y sesiones del caché) */
    avanzar: (seg) => (reloj += seg),
    reiniciarStats: () => Object.keys(stats).forEach((k) => (stats[k] = 0)),
    /** Ejecuta una acción y devuelve data o lanza si falló (para escribir pruebas más cortas) */
    ok(action, payload, token) {
      const r = llamar(action, payload, token)
      if (!r.ok) throw new Error(`${action} falló: ${r.error} [${r.code}]`)
      return r.data
    },
  }
}

export const CLAVE_INICIAL = 'Ferisel2026!'
