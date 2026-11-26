// Detección de plataforma para guiar la instalación de la app, y enlace del código QR. Funciones puras (se prueban en Node).

/**
 * @param ua      navigator.userAgent
 * @param opciones.standalone  la app ya está abierta como app instalada
 * @param opciones.tactil      el dispositivo es táctil (iPadOS se presenta como un Mac)
 * @returns { sistema: 'ios'|'android'|'escritorio', navegador, enApp, instalada }
 *   enApp = navegador integrado de otra app (WhatsApp, Facebook, Instagram...): ahí no se puede instalar
 */
export function detectarPlataforma(ua = '', { standalone = false, tactil = false } = {}) {
  const enApp = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|MicroMessenger|Snapchat|TikTok|; wv\)/i.test(ua)
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && tactil)
  const android = /Android/i.test(ua)
  const navegador = /EdgiOS|Edg\/|EdgA\//.test(ua)
    ? 'edge'
    : /FxiOS|Firefox/.test(ua)
      ? 'firefox'
      : /SamsungBrowser/.test(ua)
        ? 'samsung'
        : /CriOS|Chrome\//.test(ua)
          ? 'chrome'
          : /Safari/.test(ua)
            ? 'safari'
            : 'otro'
  return { sistema: ios ? 'ios' : android ? 'android' : 'escritorio', navegador, enApp, instalada: standalone }
}

/**
 * Enlace que lleva el QR: la dirección de la app con ?instalar=1, que abre una pantalla de instalación antes del ingreso.
 * Con `empresa` agrega &empresa=<id>, para que el ingreso muestre su logo y colores.
 * Devuelve '' si la dirección no es válida (debe ser http:// o https:// completa).
 */
export function enlaceInstalacion(direccion, empresa = '') {
  try {
    const u = new URL(String(direccion || '').trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return ''
    u.search = ''
    u.hash = ''
    u.searchParams.set('instalar', '1')
    if (empresa) u.searchParams.set('empresa', empresa)
    return u.toString()
  } catch {
    return ''
  }
}

/** Avisos sobre una dirección antes de imprimir el QR: ['sin-https', 'local'] */
export function avisosDireccion(direccion) {
  try {
    const u = new URL(String(direccion || '').trim())
    const avisos = []
    if (u.protocol !== 'https:') avisos.push('sin-https')
    if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) || u.hostname.endsWith('.local')) avisos.push('local')
    return avisos
  } catch {
    return []
  }
}
