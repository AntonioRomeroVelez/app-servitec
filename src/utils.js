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

// ---------------- Datos de personas (usuarios y administradores de empresas) ----------------

/** Cédula ecuatoriana: 10 dígitos, provincia 01-24 o 30, tercer dígito menor a 6 y dígito verificador (módulo 10). */
export function cedulaValida(cedula) {
  const c = String(cedula || '').trim()
  if (!/^\d{10}$/.test(c)) return false
  const provincia = Number(c.slice(0, 2))
  if (!((provincia >= 1 && provincia <= 24) || provincia === 30) || Number(c[2]) >= 6) return false
  const suma = [2, 1, 2, 1, 2, 1, 2, 1, 2].reduce((s, k, i) => {
    const p = Number(c[i]) * k
    return s + (p > 9 ? p - 9 : p)
  }, 0)
  return (10 - (suma % 10)) % 10 === Number(c[9])
}

/** Por qué una cédula no es válida (mensaje para la persona), o '' si lo es. */
export function motivoCedulaInvalida(cedula) {
  const c = String(cedula || '').trim()
  if (!c) return 'Escribe la cédula'
  if (!/^\d+$/.test(c)) return 'La cédula solo lleva números'
  if (c.length !== 10) return `La cédula tiene 10 dígitos (tiene ${c.length})`
  const provincia = Number(c.slice(0, 2))
  if (!((provincia >= 1 && provincia <= 24) || provincia === 30)) return 'Los dos primeros dígitos (provincia) no son válidos: van del 01 al 24 o 30'
  if (Number(c[2]) >= 6) return 'El tercer dígito de la cédula debe ser menor a 6'
  if (!cedulaValida(c)) return 'El último dígito de la cédula (verificador) no corresponde: revisa el número'
  return ''
}

/** Teléfono: de 7 a 15 dígitos (admite +, espacios y guiones). */
export const telefonoValido = (t) => {
  const digitos = String(t || '').replace(/\D/g, '')
  return /^[+\d][\d\s()-]*$/.test(String(t || '').trim()) && digitos.length >= 7 && digitos.length <= 15
}

export const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(c || '').trim())

// Palabras que forman parte de un apellido compuesto ("De la Cruz", "Del Pozo")
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'san', 'santa', 'y'])

/**
 * Usuario sugerido: primer nombre + últimos 4 dígitos de la cédula, sin tildes y en minúsculas
 * ("Carlos Andrés Romero Vélez", 1710034065 -> carlos4065). Si ya está ocupado se agrega la primera letra del apellido
 * (carlos4065r), luego la segunda (carlos4065ro) y así; agotadas las letras, un número. La persona puede cambiarlo.
 * Con 4 o más palabras el primer apellido es la tercera; con 2 o 3, la última. `existentes` son los usuarios ya tomados.
 * La base de datos aplica la misma regla (app.sugerir_usuario) y es la que garantiza que sea único.
 */
export function generarUsuario(nombreCompleto, cedula, existentes = []) {
  const limpio = String(nombreCompleto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ')
  const palabras = []
  let prefijo = ''
  for (const t of limpio.split(/\s+/).filter(Boolean)) {
    if (PARTICULAS.has(t)) prefijo += t
    else {
      palabras.push(prefijo + t)
      prefijo = ''
    }
  }
  const digitos = String(cedula || '').replace(/\D/g, '')
  if (!palabras.length || digitos.length < 4) return ''
  const apellido = palabras.length >= 4 ? palabras[2] : palabras.length >= 2 ? palabras[palabras.length - 1] : ''
  const base = palabras[0].slice(0, 20) + digitos.slice(-4)
  const usados = new Set(existentes.map((u) => String(u).toLowerCase()))
  if (!usados.has(base)) return base
  for (let k = 1; k <= apellido.length; k++) {
    const candidato = (base + apellido.slice(0, k)).slice(0, 30)
    if (!usados.has(candidato)) return candidato
  }
  const raiz = (base + apellido).slice(0, 26)
  for (let n = 2; ; n++) if (!usados.has(raiz + n)) return raiz + n
}

/** Formato permitido para un usuario de ingreso. */
export const usuarioValido = (u) => /^[a-z0-9._-]{3,30}$/.test(String(u || ''))
