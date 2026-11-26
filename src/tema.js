// Colores de la app. El superadmin elige un color principal y uno de acento; de ahí se calcula toda la paleta (brand-50 a
// brand-950) y se aplica como variables CSS, que son las que usa Tailwind (bg-brand-600, text-brand-800, bg-acento...).
import { CONFIG_DEFECTO } from './configuracion.js'

const limitar = (n, min, max) => Math.min(max, Math.max(min, n))
const aHex2 = (n) => Math.round(limitar(n, 0, 255)).toString(16).padStart(2, '0')

export function hexARgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

export function rgbAHex(r, g, b) {
  return `#${aHex2(r)}${aHex2(g)}${aHex2(b)}`
}

// -> [tono 0-360, saturación 0-100, luminosidad 0-100]
export function hexAHsl(hex) {
  const [r, g, b] = hexARgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s * 100, l * 100]
}

export function hslAHex(h, s, l) {
  const S = limitar(s, 0, 100) / 100
  const L = limitar(l, 0, 100) / 100
  const k = (n) => (n + h / 30) % 12
  const a = S * Math.min(L, 1 - L)
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return rgbAHex(f(0) * 255, f(8) * 255, f(4) * 255)
}

// Luminancia y contraste WCAG (4,5 o más = texto legible). Misma fórmula que contraste_ en Code.gs.
export function luminancia(hex) {
  const [r, g, b] = hexARgb(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contraste(a, b) {
  const l1 = luminancia(a)
  const l2 = luminancia(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/** Paleta completa a partir del color principal (que pasa a ser brand-600, el de los botones) */
export function paleta(primario) {
  const [h, s, l] = hexAHsl(primario)
  const tono = (luz) => hslAHex(h, s, limitar(luz, 4, 98))
  return {
    50: tono(96),
    100: tono(92),
    200: tono(84),
    300: tono(73),
    400: tono(60),
    500: tono(Math.min(l + 8, 58)),
    600: primario,
    // Los oscuros son proporcionales al color base (no una resta fija): así un principal ya oscuro no se vuelve casi negro
    700: tono(l * 0.85),
    800: tono(l * 0.62),
    900: tono(l * 0.45),
    950: tono(l * 0.3),
  }
}

/** Color de texto legible sobre `fondo`: el más oscuro de la paleta o blanco, el que mejor contraste dé */
export const textoSobre = (fondo, oscuro) => (contraste(fondo, oscuro) >= contraste(fondo, '#ffffff') ? oscuro : '#ffffff')

/** Estilo del fondo de la pantalla de ingreso: degradado de la marca, color sólido o la foto de la empresa (oscurecida). */
export function estiloFondo(tema = {}, imagen = '') {
  if (tema.fondo === 'foto' && imagen) {
    return { backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.65)), url("${imagen}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  if (tema.fondo === 'solido') return { backgroundColor: tema.encabezado || 'var(--color-brand-800)' }
  return { backgroundImage: 'linear-gradient(to bottom, var(--color-brand-900), var(--color-brand-700), var(--color-brand-500))' }
}

/** Combinaciones listas para elegir */
export const TEMAS_PREDEFINIDOS = [
  { nombre: 'Azul y amarillo', primario: '#1565d8', acento: '#f6c915' },
  { nombre: 'Verde y naranja', primario: '#157347', acento: '#f59e0b' },
  { nombre: 'Rojo y gris', primario: '#b3261e', acento: '#cbd5e1' },
  { nombre: 'Índigo y turquesa', primario: '#4338ca', acento: '#2dd4bf' },
  { nombre: 'Grafito y dorado', primario: '#374151', acento: '#d4a017' },
]

const VARIABLES = Object.keys(paleta(CONFIG_DEFECTO.tema.primario)).map((k) => `--color-brand-${k}`).concat(['--color-acento', '--color-acento-600', '--color-acento-texto'])

/** Aplica el tema a toda la app. Con los colores por defecto quita los cambios y la app queda exactamente como se diseñó. */
export function aplicarTema(tema = CONFIG_DEFECTO.tema) {
  if (typeof document === 'undefined') return
  const raiz = document.documentElement
  const meta = document.querySelector('meta[name="theme-color"]')
  // Color propio del encabezado y el menú; sin él se usa el tono 800 de la paleta (definido en style.css)
  if (tema.encabezado) raiz.style.setProperty('--color-encabezado', tema.encabezado)
  else raiz.style.removeProperty('--color-encabezado')
  if (tema.primario === CONFIG_DEFECTO.tema.primario && tema.acento === CONFIG_DEFECTO.tema.acento) {
    VARIABLES.forEach((v) => raiz.style.removeProperty(v))
    meta?.setAttribute('content', tema.encabezado || '#0b3a85')
    return
  }
  const p = paleta(tema.primario)
  for (const [k, v] of Object.entries(p)) raiz.style.setProperty(`--color-brand-${k}`, v)
  const [h, s, l] = hexAHsl(tema.acento)
  raiz.style.setProperty('--color-acento', tema.acento)
  raiz.style.setProperty('--color-acento-600', hslAHex(h, s, l - 8))
  raiz.style.setProperty('--color-acento-texto', textoSobre(tema.acento, p[950]))
  meta?.setAttribute('content', tema.encabezado || p[800])
}
