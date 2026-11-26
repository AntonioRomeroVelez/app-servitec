// Compresión de fotos en el dispositivo antes de subirlas, para ocupar el menor espacio posible en Drive sin perder
// legibilidad: se reduce el lado mayor y se re-codifica como JPEG con un peso objetivo de 200 KB (una foto de cámara
// suele pesar 3-8 MB). El JPEG además descarta los metadatos de la cámara.

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
export async function comprimirImagen(file, { ladoMax = 1280, ladoMin = 960, calidad = 0.72, calidadMin = 0.5, maxBytes = 200 * 1024 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" no es una imagen`)
  if (file.size > 30 * 1024 * 1024) throw new Error(`"${file.name}" pesa demasiado (máx. 30 MB)`)

  const src = await cargarImagen(file)

  // Primero baja la calidad (hasta 0.5, donde el texto aún se lee); si sigue pesando, achica la foto (hasta 960 px)
  let lado = ladoMax
  let canvas
  let blob
  for (;;) {
    canvas = dibujar(src, lado)
    let q = calidad
    blob = await aBlob(canvas, q)
    while (blob.size > maxBytes && q > calidadMin) {
      q = Math.max(calidadMin, q - 0.07)
      blob = await aBlob(canvas, q)
    }
    if (blob.size <= maxBytes || lado <= ladoMin) break
    lado = Math.max(ladoMin, lado - 160)
  }

  // Miniatura para la galería: se guarda en una celda de la hoja de la empresa, por eso es muy pequeña
  let ladoMini = 200
  let mini = ''
  for (;;) {
    mini = await leerComoDataUrl(await aBlob(dibujar(src, ladoMini), 0.5))
    if (mini.length < 20000 || ladoMini <= 120) break
    ladoMini -= 40
  }
  src.close?.()

  const dataUrl = await leerComoDataUrl(blob)
  return { imagen: dataUrl.split(',')[1], mini, bytes: blob.size, ancho: canvas.width, alto: canvas.height }
}

/**
 * Prepara la foto de fondo del ingreso: JPEG que cabe en una celda de Sheets (menos de ~44.000 caracteres). Se muestra
 * oscurecida detrás del formulario, así que admite poca resolución. Devuelve un data URL.
 */
export async function procesarFondo(file, { maxCaracteres = 44000 } = {}) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Elige una foto JPG, PNG o WebP')
  if (file.size > 30 * 1024 * 1024) throw new Error('La foto pesa demasiado (máximo 30 MB)')
  const src = await cargarImagen(file)
  for (const lado of [1200, 1000, 840, 700, 560, 440]) {
    const canvas = dibujar(src, lado)
    for (const calidad of [0.6, 0.45, 0.32]) {
      const url = await leerComoDataUrl(await aBlob(canvas, calidad))
      if (url.length <= maxCaracteres) {
        src.close?.()
        return url
      }
    }
  }
  throw new Error('No se pudo reducir la foto lo suficiente. Prueba con otra.')
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

/**
 * Mide una imagen (data URL) para el PDF: devuelve { data, formato, ancho, alto }. Las WebP (o con aPng) se pasan a PNG
 * porque el PDF no las admite; el PNG conserva la transparencia de los logos.
 */
export function medirImagen(dataUrl, { aPng = false } = {}) {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => {
      let data = dataUrl
      let formato = /^data:image\/png/.test(dataUrl) ? 'PNG' : 'JPEG'
      if (aPng || /^data:image\/webp/.test(dataUrl)) {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d').drawImage(img, 0, 0)
        data = canvas.toDataURL('image/png')
        formato = 'PNG'
      }
      res({ data, formato, ancho: img.naturalWidth, alto: img.naturalHeight })
    }
    img.onerror = () => rej(new Error('No se pudo leer una imagen del informe'))
    img.src = dataUrl
  })
}
