// Genera los iconos de la app instalable (PWA) en /public: un candado con los colores de Ferisel.
// Uso: node scripts/generar-iconos.mjs   (los PNG generados se guardan en el repositorio)
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const AZUL = [11, 58, 133] // brand-800
const AZUL_CLARO = [21, 101, 216] // brand-600
const AMARILLO = [246, 201, 21] // acento
const BLANCO = [255, 255, 255]

// --- Formas (coordenadas normalizadas 0..1; devuelven la distancia con signo: <0 = dentro) ---
const cajaRedondeada = (x, y, cx, cy, mx, my, r) => {
  const qx = Math.abs(x - cx) - mx + r
  const qy = Math.abs(y - cy) - my + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}
const circulo = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r
const rect = (x, y, x0, y0, x1, y1) => Math.max(x0 - x, x - x1, y0 - y, y - y1)

// Pixel (colores en [r,g,b]) dentro de una escala de contenido (para el área segura de los iconos "maskable")
function color(u, v, escala, redondeado) {
  if (redondeado && cajaRedondeada(u, v, 0.5, 0.5, 0.5, 0.5, 0.22) > 0) return null // esquina transparente
  const x = (u - 0.5) / escala + 0.5
  const y = (v - 0.5) / escala + 0.5

  let c = AZUL.map((a, i) => a + (AZUL_CLARO[i] - a) * v * 0.9) // degradado vertical suave

  // grillete del candado (arco superior + dos patas)
  const arco = Math.max(circulo(x, y, 0.5, 0.4, 0.17), -circulo(x, y, 0.5, 0.4, 0.105), y - 0.4)
  const patas = Math.min(rect(x, y, 0.33, 0.4, 0.395, 0.52), rect(x, y, 0.605, 0.4, 0.67, 0.52))
  if (Math.min(arco, patas) < 0) c = BLANCO

  // cuerpo del candado
  if (cajaRedondeada(x, y, 0.5, 0.62, 0.22, 0.17, 0.05) < 0) c = AMARILLO

  // ojo de la cerradura
  if (Math.min(circulo(x, y, 0.5, 0.6, 0.034), rect(x, y, 0.483, 0.6, 0.517, 0.69)) < 0) c = AZUL
  return c
}

function dibujar(tam, escala, redondeado) {
  const datos = Buffer.alloc(tam * tam * 4)
  const m = 3 // supermuestreo 3x3 para bordes suaves
  for (let py = 0; py < tam; py++) {
    for (let px = 0; px < tam; px++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < m; sy++) {
        for (let sx = 0; sx < m; sx++) {
          const c = color((px + (sx + 0.5) / m) / tam, (py + (sy + 0.5) / m) / tam, escala, redondeado)
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++ }
        }
      }
      const i = (py * tam + px) * 4
      if (a) { datos[i] = r / a; datos[i + 1] = g / a; datos[i + 2] = b / a }
      datos[i + 3] = Math.round((a / (m * m)) * 255)
    }
  }
  return datos
}

// --- Codificador PNG mínimo ---
const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function bloque(tipo, datos) {
  const cuerpo = Buffer.concat([Buffer.from(tipo), datos])
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([largo, cuerpo, crc])
}
function png(tam, rgba) {
  const cabecera = Buffer.alloc(13)
  cabecera.writeUInt32BE(tam, 0)
  cabecera.writeUInt32BE(tam, 4)
  cabecera.set([8, 6, 0, 0, 0], 8) // 8 bits, RGBA
  const filas = Buffer.alloc(tam * (tam * 4 + 1))
  for (let y = 0; y < tam; y++) {
    filas[y * (tam * 4 + 1)] = 0 // filtro: ninguno
    rgba.copy(filas, y * (tam * 4 + 1) + 1, y * tam * 4, (y + 1) * tam * 4)
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloque('IHDR', cabecera), bloque('IDAT', zlib.deflateSync(filas, { level: 9 })), bloque('IEND', Buffer.alloc(0))])
}

const destino = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'public')
fs.mkdirSync(destino, { recursive: true })
const iconos = [
  ['icon-192.png', 192, 1, true],
  ['icon-512.png', 512, 1, true],
  ['icon-maskable-512.png', 512, 0.72, false], // a sangre y con el candado dentro del área segura
  ['apple-touch-icon.png', 180, 0.9, false], // iOS aplica sus propias esquinas
]
for (const [nombre, tam, escala, redondeado] of iconos) {
  const archivo = path.join(destino, nombre)
  fs.writeFileSync(archivo, png(tam, dibujar(tam, escala, redondeado)))
  console.log(`${nombre} (${tam}x${tam}) ${(fs.statSync(archivo).size / 1024).toFixed(1)} KB`)
}
