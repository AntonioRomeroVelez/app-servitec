// Pruebas de lo que no depende del navegador: detección de plataforma, enlace del QR y que el QR realmente se pueda leer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { detectarPlataforma, enlaceInstalacion, avisosDireccion } from '../../src/plataforma.js'

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1',
  ipadComoMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0',
  androidWhatsApp: 'Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E236 Instagram 330.0.0.20.113',
  iphoneFacebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E236 [FBAN/FBIOS;FBAV/450.0.0.0]',
  escritorioChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  escritorioEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
}

test('detecta sistema y navegador para mostrar las instrucciones correctas', () => {
  const caso = (ua, opciones) => detectarPlataforma(ua, opciones)
  assert.deepEqual(caso(UA.iphoneSafari), { sistema: 'ios', navegador: 'safari', enApp: false, instalada: false })
  assert.deepEqual(caso(UA.iphoneChrome).sistema + '/' + caso(UA.iphoneChrome).navegador, 'ios/chrome')
  assert.equal(caso(UA.ipadComoMac, { tactil: true }).sistema, 'ios') // un iPad se presenta como Mac pero es táctil
  assert.equal(caso(UA.ipadComoMac, { tactil: false }).sistema, 'escritorio') // un Mac de verdad no
  assert.deepEqual(caso(UA.androidChrome).sistema + '/' + caso(UA.androidChrome).navegador, 'android/chrome')
  assert.equal(caso(UA.androidSamsung).navegador, 'samsung')
  assert.equal(caso(UA.androidFirefox).navegador, 'firefox')
  assert.deepEqual(caso(UA.escritorioChrome).sistema + '/' + caso(UA.escritorioChrome).navegador, 'escritorio/chrome')
  assert.equal(caso(UA.escritorioEdge).navegador, 'edge')
  assert.equal(caso(UA.escritorioChrome, { standalone: true }).instalada, true)
})

test('detecta los navegadores integrados de otras apps (desde ahí no se puede instalar)', () => {
  for (const ua of [UA.androidWhatsApp, UA.iphoneInstagram, UA.iphoneFacebook]) assert.equal(detectarPlataforma(ua).enApp, true, ua)
  for (const ua of [UA.iphoneSafari, UA.androidChrome, UA.escritorioChrome]) assert.equal(detectarPlataforma(ua).enApp, false, ua)
})

test('enlace del QR: dirección de la app con ?instalar=1, conservando la ruta', () => {
  assert.equal(enlaceInstalacion('https://servitec.ejemplo.com'), 'https://servitec.ejemplo.com/?instalar=1')
  assert.equal(enlaceInstalacion('  https://usuario.github.io/app-servitec/  '), 'https://usuario.github.io/app-servitec/?instalar=1')
  assert.equal(enlaceInstalacion('https://x.com/app/?utm=1#abc'), 'https://x.com/app/?instalar=1') // sin parámetros ni ancla previos
  for (const malo of ['', 'servitec.com', 'javascript:alert(1)', 'ftp://x.com', 'no es una url', null]) assert.equal(enlaceInstalacion(malo), '', String(malo))
})

test('avisos de la dirección: sin HTTPS y direcciones locales', () => {
  assert.deepEqual(avisosDireccion('https://servitec.ejemplo.com'), [])
  assert.deepEqual(avisosDireccion('http://servitec.ejemplo.com'), ['sin-https'])
  assert.deepEqual(avisosDireccion('http://localhost:5173/'), ['sin-https', 'local'])
  assert.deepEqual(avisosDireccion('http://192.168.1.20:5173'), ['sin-https', 'local'])
  assert.deepEqual(avisosDireccion('https://equipo.local/app'), ['local'])
})

// Dibuja la matriz del QR en una imagen (sin navegador) y la lee con un decodificador independiente
function leerQr(texto, { modulo = 8, margen = 4, nivel = 'M' } = {}) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: nivel })
  const n = qr.modules.size
  const lado = (n + margen * 2) * modulo
  const rgba = new Uint8ClampedArray(lado * lado * 4).fill(255)
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(f, c)) continue
      for (let y = 0; y < modulo; y++) {
        for (let x = 0; x < modulo; x++) {
          const i = (((f + margen) * modulo + y) * lado + (c + margen) * modulo + x) * 4
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 20
        }
      }
    }
  }
  return jsQR(rgba, lado, lado)?.data
}

test('el QR generado se puede leer y lleva exactamente el enlace de instalación', () => {
  for (const direccion of ['https://servitec.ejemplo.com', 'https://usuario.github.io/app-servitec/', 'https://app.ferisel.com.ec/servitec/']) {
    const enlace = enlaceInstalacion(direccion)
    assert.equal(leerQr(enlace), enlace, direccion)
  }
})

test('el QR se sigue leyendo con módulos pequeños (impreso chico) y con un enlace largo', () => {
  const largo = enlaceInstalacion('https://servitec-visitas-e-informes.empresa-de-seguridad.com.ec/aplicacion/principal/')
  assert.equal(leerQr(largo, { modulo: 4 }), largo)
  assert.equal(leerQr(enlaceInstalacion('https://x.com'), { modulo: 3, nivel: 'L' }), 'https://x.com/?instalar=1')
})
