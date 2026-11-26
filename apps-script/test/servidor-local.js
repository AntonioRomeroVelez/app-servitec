// Servidor local que ejecuta el Code.gs REAL dentro del simulador y lo expone por HTTP, para probar la app completa
// (login, agenda, informes, fotos, notificaciones, modo sin conexión) sin publicar nada en Google.
//
//   npm run servidor:local                       -> http://127.0.0.1:5400
//   VITE_SCRIPT_URL=http://127.0.0.1:5400 npm run dev
//
// Los datos viven en memoria (se pierden al reiniciar). Para simular que se cae la conexión:
//   GET /__red?estado=off   -> las peticiones POST fallan como si no hubiera red
//   GET /__red?estado=on    -> vuelve la conexión
import http from 'node:http'
import { entornoListo, datosVisita } from './ayudas.js'

const PUERTO = Number(process.env.PORT || 5400)
const LATENCIA = Number(process.env.LATENCIA || 0) // ms de espera por petición, para imitar a Google
const e = entornoListo()

const dia = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Datos de ejemplo: tres visitas para el técnico "carlos"
e.env.ok('visitas_create', { data: datosVisita({ fecha: dia(0), hora: '09:00', cliente: 'Banco del Sur', direccion: 'Av. Amazonas 123' }) }, e.admin.token)
e.env.ok('visitas_create', { data: datosVisita({ fecha: dia(1), hora: '10:30', cliente: 'Clínica Norte', direccion: 'Calle Bolívar 45' }) }, e.admin.token)
const aceptada = e.env.ok('visitas_create', { data: datosVisita({ fecha: dia(0), hora: '14:00', cliente: 'Centro Comercial Plaza', direccion: 'Panamericana Norte km 5' }) }, e.admin.token)
e.env.ok('visitas_update', { id: aceptada.id, data: { estado: 'Aceptada' } }, e.tec.token)

let red = true
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (url.pathname === '/__red') {
    red = url.searchParams.get('estado') !== 'off'
    res.writeHead(200, { ...cors, 'content-type': 'application/json' })
    return res.end(JSON.stringify({ red }))
  }
  // GET /__hoja?nombre=Bitácora -> contenido de una hoja tal como se vería en Sheets (fechas con su formato de columna)
  if (url.pathname === '/__hoja') {
    const hoja = e.env.hoja(url.searchParams.get('nombre') || '')
    const p2 = (n) => String(n).padStart(2, '0')
    const formatear = (v, formato) => {
      if (Object.prototype.toString.call(v) !== '[object Date]') return v
      const fecha = `${p2(v.getDate())}-${p2(v.getMonth() + 1)}-${v.getFullYear()}`
      return formato && formato.includes('HH') ? `${fecha} ${p2(v.getHours())}:${p2(v.getMinutes())}` : fecha
    }
    res.writeHead(200, { ...cors, 'content-type': 'application/json' })
    return res.end(JSON.stringify(hoja ? hoja.filas.map((fila) => fila.map((v, i) => formatear(v, hoja.formatos[i + 1]))) : null))
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    return res.end()
  }
  if (req.method === 'GET') {
    res.writeHead(200, { ...cors, 'content-type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, servicio: 'Simulador local de ServiTec', red }))
  }
  if (!red) return req.socket.destroy() // como si la conexión se hubiera caído

  let cuerpo = ''
  req.on('data', (c) => (cuerpo += c))
  req.on('end', () =>
    setTimeout(() => {
      res.writeHead(200, { ...cors, 'content-type': 'application/json' })
      res.end(e.env.crudo(cuerpo))
    }, LATENCIA),
  )
})

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`Simulador de Apps Script escuchando en http://127.0.0.1:${PUERTO}`)
  console.log('Usuarios (clave de todos: Clave-Definitiva-77): lucia (admin), marta (admin), carlos (técnico), diego (técnico)')
  console.log('Root: superadmin / Nueva-Root-2026  |  Superadmin de la empresa: servitec / Nueva-Super-2026')
  console.log('Cortar la red: GET /__red?estado=off  |  Restablecerla: GET /__red?estado=on')
})
