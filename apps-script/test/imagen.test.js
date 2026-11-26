// Compresión de fotos antes de subirlas, con un lienzo simulado: el peso depende de los píxeles y de la calidad.
import test from 'node:test'
import assert from 'node:assert/strict'
import { comprimirImagen } from '../../src/imagen.js'

/** Simula el navegador. `detalle` son los bytes por píxel a calidad 1. Devuelve el resultado de comprimir una foto. */
async function comprimir(detalle, ancho = 4000, alto = 3000) {
  globalThis.window = { createImageBitmap: true }
  globalThis.createImageBitmap = async () => ({ width: ancho, height: alto })
  globalThis.document = {
    createElement: () => {
      const canvas = {
        getContext: () => ({ fillRect() {}, drawImage() {} }),
        toBlob: (listo, tipo, calidad) => listo({ type: tipo, size: Math.round(canvas.width * canvas.height * calidad * detalle) }),
      }
      return canvas
    },
  }
  globalThis.FileReader = class {
    readAsDataURL(blob) {
      this.result = 'data:image/jpeg;base64,' + 'A'.repeat(Math.min(blob.size, 15000))
      this.onload()
    }
  }
  return comprimirImagen({ type: 'image/jpeg', size: 5 * 1024 * 1024, name: 'foto.jpg' })
}

test('una foto normal queda en 1280 px y por debajo de 200 KB', async () => {
  const r = await comprimir(0.2)
  assert.deepEqual([r.ancho, r.alto], [1280, 960])
  assert.ok(r.bytes <= 200 * 1024, String(r.bytes))
  assert.ok(r.mini.length < 20100)
})

test('una foto con mucho detalle primero baja de calidad y después de tamaño', async () => {
  const r = await comprimir(0.45)
  assert.ok(r.ancho < 1280 && r.ancho >= 960, String(r.ancho))
  assert.ok(r.bytes <= 200 * 1024, String(r.bytes))
})

test('nunca baja de 960 px y una foto pequeña no se agranda', async () => {
  assert.equal((await comprimir(2)).ancho, 960)
  assert.equal((await comprimir(0.1, 800, 600)).ancho, 800)
})
