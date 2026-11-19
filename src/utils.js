const dos = (n) => String(n).padStart(2, '0')
const aIso = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`

// Fecha local (no UTC) en formato YYYY-MM-DD
export const hoy = () => aIso(new Date())
export const manana = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return aIso(d)
}

export const fechaLarga = (f) =>
  new Date(`${f}T00:00:00`).toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' })

// Política de claves (misma que validarClave_ en Code.gs). Devuelve el mensaje de error o '' si es válida.
export function validarClave(clave, usuario = '') {
  const c = String(clave || '')
  if (c.length < 10) return 'La clave debe tener al menos 10 caracteres'
  if (!/[A-Za-z]/.test(c) || !/[0-9]/.test(c)) return 'La clave debe incluir letras y números'
  if (usuario && c.toLowerCase().includes(String(usuario).toLowerCase())) return 'La clave no debe contener el nombre de usuario'
  return ''
}

// Fecha (YYYY-MM-DD) de hace n días
export const haceDias = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return aIso(d)
}

// El día anterior a una fecha YYYY-MM-DD
export const diaAnterior = (f) => {
  const d = new Date(`${f}T00:00:00`)
  d.setDate(d.getDate() - 1)
  return aIso(d)
}

// "hace 5 min", "hace 3 h", "ayer", "hace 4 d" o la fecha corta
export function tiempoRelativo(iso) {
  const t = new Date(iso).getTime()
  if (!t) return ''
  const min = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return 'ayer'
  if (d < 7) return `hace ${d} d`
  return new Date(t).toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })
}

// "Banco  del Sur", "banco del sur" y "BANCO DEL SÚR" -> "banco del sur" (misma regla que normalizar_ en Code.gs)
export const normalizar = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// 2026-11-19 -> 19-11-2026 (el mismo formato que se ve en el Sheet)
export const fechaCorta = (f) => {
  const p = String(f || '').split('-')
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : String(f || '')
}
