// Compresión de fotos en el dispositivo antes de subirlas: se reduce el lado mayor y se re-codifica
// como JPEG, manteniendo texto y detalles legibles (típicamente 150-400 KB en lugar de 3-8 MB).

const leerComoDataUrl = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(new Error('No se pudo leer la imagen'))
    r.readAsDataURL(blob)
  })

async function cargarImagen(file) {
  // 'from-image' respeta la orientación EXIF (fotos tomadas en vertical)
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* se intenta con <img> */
    }
  }
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      res(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      rej(new Error('No se pudo abrir la imagen. Usa una foto JPG o PNG.'))
    }
    img.src = url
  })
}

function dibujar(src, ladoMax) {
  const k = Math.min(1, ladoMax / Math.max(src.width, src.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(src.width * k)
  canvas.height = Math.round(src.height * k)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff' // PNG con transparencia -> fondo blanco
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
  return canvas
}

const aBlob = (canvas, calidad) => new Promise((res) => canvas.toBlob(res, 'image/jpeg', calidad))

/**
 * @returns {{ imagen: string, mini: string, bytes: number, ancho: number, alto: number }}
 *  imagen: JPEG en base64 (sin prefijo data:), mini: miniatura como data URL
 */
export async function comprimirImagen(file, { ladoMax = 1600, calidad = 0.75, maxBytes = 500 * 1024 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" no es una imagen`)
  if (file.size > 30 * 1024 * 1024) throw new Error(`"${file.name}" pesa demasiado (máx. 30 MB)`)

  const src = await cargarImagen(file)
  const canvas = dibujar(src, ladoMax)

  // Baja la calidad por pasos (hasta 0.5, donde el texto aún se lee bien) si supera el peso objetivo
  let q = calidad
  let blob = await aBlob(canvas, q)
  while (blob.size > maxBytes && q > 0.5) {
    q -= 0.08
    blob = await aBlob(canvas, q)
  }

  // Miniatura para la galería (debe caber holgada en una celda de Google Sheets)
  let lado = 240
  let mini = ''
  for (;;) {
    mini = await leerComoDataUrl(await aBlob(dibujar(src, lado), 0.5))
    if (mini.length < 40000 || lado <= 120) break
    lado -= 40
  }
  src.close?.()

  const dataUrl = await leerComoDataUrl(blob)
  return { imagen: dataUrl.split(',')[1], mini, bytes: blob.size, ancho: canvas.width, alto: canvas.height }
}

/**
 * Prepara el logo de la empresa: lo reduce (máx. 480 px por lado) y lo guarda como WebP o PNG con transparencia, de modo que
 * quepa en una celda de Sheets (menos de ~40.000 caracteres). Acepta PNG, JPG, WebP y SVG (el SVG se convierte en imagen:
 * así nunca se guarda código). Devuelve un data URL.
 */
export async function procesarLogo(file, { maxLado = 480, maxCaracteres = 40000 } = {}) {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error('Elige una imagen PNG, JPG, WebP o SVG')
  if (file.size > 10 * 1024 * 1024) throw new Error('La imagen pesa demasiado (máximo 10 MB)')
  const src = await cargarImagen(file)
  const ancho = src.width || 300
  const alto = src.height || 100
  const esSvg = file.type === 'image/svg+xml'

  let lado = maxLado
  for (let intento = 0; intento < 8; intento++) {
    const k = esSvg ? lado / Math.max(ancho, alto) : Math.min(1, lado / Math.max(ancho, alto))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(ancho * k))
    canvas.height = Math.max(1, Math.round(alto * k))
    canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height) // sin fondo: conserva la transparencia
    for (const formato of ['image/webp', 'image/png']) {
      const url = canvas.toDataURL(formato, 0.9)
      if (url.startsWith(`data:${formato}`) && url.length <= maxCaracteres) return url
    }
    lado = Math.round(lado * 0.8) // todavía pesa mucho: se reduce y se vuelve a intentar
  }
  throw new Error('No se pudo reducir el logo lo suficiente. Prueba con una imagen más simple o más pequeña.')
}
