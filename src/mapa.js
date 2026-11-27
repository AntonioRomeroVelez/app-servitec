// Ubicación de una visita: se guarda como texto "latitud,longitud". El mapa y las direcciones son de OpenStreetMap
// (gratis, sin clave) y "Cómo llegar" abre Google Maps en el punto exacto. La validación se repite en Code.gs.

export const CENTRO_INICIAL = { lat: -0.180653, lng: -78.467834 } // Quito

/** "-0.180653,-78.467834" -> { lat, lng }, o null si no es un punto válido. */
export function leerUbicacion(texto) {
  const m = /^(-?\d{1,2}(?:\.\d{1,7})?),(-?\d{1,3}(?:\.\d{1,7})?)$/.exec(String(texto || ''))
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
}

export const textoUbicacion = ({ lat, lng }) => `${lat.toFixed(6)},${lng.toFixed(6)}`

/** Google Maps en el punto marcado; si la visita no tiene punto, buscando su dirección. */
export function enlaceGoogleMaps({ ubicacion, direccion }) {
  const punto = leerUbicacion(ubicacion)
  const buscar = punto ? `${punto.lat},${punto.lng}` : String(direccion || '').trim()
  return buscar ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(buscar)}` : ''
}

/** Dirección corta a partir de una respuesta de Nominatim: calle y número, barrio y ciudad. */
export function direccionDe(r) {
  const a = r?.address
  if (!a) return String(r?.display_name || '')
  const calle = [a.road || a.pedestrian || a.footway || a.path, a.house_number].filter(Boolean).join(' ')
  const partes = [r.name, calle, a.neighbourhood || a.suburb || a.quarter, a.city || a.town || a.village || a.county]
  const corta = [...new Set(partes.filter(Boolean))].join(', ')
  return (corta || String(r.display_name || '')).slice(0, 200)
}

// Nominatim es un servicio gratuito compartido: como máximo una consulta por segundo y solo cuando la persona la pide
const API = 'https://nominatim.openstreetmap.org'
let ultima = 0

async function consultar(ruta, parametros) {
  const espera = Math.max(0, ultima + 1100 - Date.now())
  ultima = Date.now() + espera
  if (espera) await new Promise((r) => setTimeout(r, espera))
  const res = await fetch(`${API}/${ruta}?${new URLSearchParams({ format: 'jsonv2', 'accept-language': 'es', addressdetails: '1', ...parametros })}`)
  if (!res.ok) throw new Error('El buscador de direcciones no respondió')
  return res.json()
}

/** Dirección del punto, o '' si no se conoce ninguna. */
export const direccionDelPunto = async ({ lat, lng }) => direccionDe(await consultar('reverse', { lat, lon: lng, zoom: '18' }))

/** Lugares de Ecuador que coinciden con lo escrito: [{ texto, lat, lng }] */
export async function buscarDireccion(texto) {
  const r = await consultar('search', { q: texto, countrycodes: 'ec', limit: '5' })
  return r.map((x) => ({ texto: x.display_name, lat: Number(x.lat), lng: Number(x.lon) }))
}
