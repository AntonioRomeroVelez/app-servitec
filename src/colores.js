// Propone los colores de la empresa a partir de su logo.
import { hexAHsl, hslAHex, rgbAHex, contraste } from './tema.js'

/** Oscurece un color hasta que el texto blanco se lea sobre él (contraste WCAG 4,5). */
export function hastaLegible(hex) {
  let [h, s, l] = hexAHsl(hex)
  let color = hex.toLowerCase()
  while (contraste(color, '#ffffff') < 4.5 && l > 0) color = hslAHex(h, s, (l -= 2))
  return color
}

const distanciaTono = (a, b) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * @param pixeles  datos RGBA seguidos (como los de getImageData)
 * @returns { primario, acento } o null si la imagen no tiene colores utilizables (transparente o blanca)
 */
export function coloresDePixeles(pixeles) {
  const grupos = new Map() // color aproximado -> { n, r, g, b }
  for (let i = 0; i + 3 < pixeles.length; i += 4) {
    const [r, g, b, a] = [pixeles[i], pixeles[i + 1], pixeles[i + 2], pixeles[i + 3]]
    if (a < 128 || Math.min(r, g, b) > 235) continue // transparente o casi blanco: es el fondo
    const clave = `${r >> 5},${g >> 5},${b >> 5}`
    const gr = grupos.get(clave) || { n: 0, r: 0, g: 0, b: 0 }
    grupos.set(clave, { n: gr.n + 1, r: gr.r + r, g: gr.g + g, b: gr.b + b })
  }
  const colores = [...grupos.values()].map((x) => {
    const hex = rgbAHex(x.r / x.n, x.g / x.n, x.b / x.n)
    const [h, s, l] = hexAHsl(hex)
    // pesa la cantidad y lo vivo del color: los grises y negros solo ganan si no hay otra cosa
    return { hex, h, s, l, peso: x.n * (s > 25 && l > 12 && l < 90 ? 1 + s / 25 : 0.2) }
  })
  if (!colores.length) return null
  colores.sort((a, b) => b.peso - a.peso)
  const base = colores[0]
  const minimo = base.peso * 0.04 // se ignoran manchas sueltas (bordes suavizados)
  const otro = colores.find((c) => c.peso >= minimo && c.s > 25 && distanciaTono(c.h, base.h) > 35)
  // Sin un segundo color en el logo, el acento es un tono cálido que contraste con el principal
  const acento = otro ? otro.hex : hslAHex(distanciaTono(base.h, 45) > 60 ? 45 : 190, 90, 55)
  return { primario: hastaLegible(base.hex), acento }
}

/** Lee una imagen (data URL) en el navegador y propone sus colores. */
export function coloresDeLogo(dataUrl) {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 96 / Math.max(img.width || 96, img.height || 96))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round((img.width || 96) * k))
      canvas.height = Math.max(1, Math.round((img.height || 96) * k))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const r = coloresDePixeles(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
      r ? res(r) : rej(new Error('El logo no tiene colores que se puedan usar'))
    }
    img.onerror = () => rej(new Error('No se pudo leer el logo'))
    img.src = dataUrl
  })
}
