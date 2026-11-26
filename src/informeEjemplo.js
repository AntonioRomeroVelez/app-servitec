// Informe de ejemplo para la vista previa de Ajustes: usa la empresa, los colores, el logo y las opciones que se están
// editando (aunque todavía no se hayan guardado), con datos inventados.
import { hoy } from './utils.js'

/** Datos del informe de ejemplo (sin imágenes), listos para generarPdfInforme. */
export function datosEjemplo({ empresa, tema, informes, tipos }) {
  const tipo = tipos.find((t) => t.checklist.some((x) => x.trim())) || tipos[0] || { nombre: 'Visita técnica', checklist: [] }
  const items = tipo.checklist.filter((x) => x.trim()).slice(0, 8)
  const fecha = hoy()
  return {
    informe: {
      numero: `${informes.prefijo || 'INF'}-${fecha.slice(0, 4)}-0001`,
      titulo: `${tipo.nombre} - Cliente de ejemplo`,
      fecha,
      cliente: 'Cliente de ejemplo',
      tipo: tipo.nombre,
      estado: 'Finalizado',
      responsable: 'Técnico de ejemplo',
      autor: 'Técnico de ejemplo',
      descripcion: 'Este es un informe de ejemplo para revisar cómo se verán el logo, los colores, los datos de la empresa y las secciones elegidas.',
      firmante: 'Persona que recibe',
    },
    empresa: { ...empresa },
    colorPrimario: tema.primario,
    checklist: items.map((item, i) => (i === 1 ? { item, resultado: 'falla', obs: 'Observación de ejemplo' } : { item, resultado: 'ok', obs: '' })),
    opciones: { ...informes },
  }
}

// Imagen inventada (foto o firma) dibujada en el navegador
function dibujo(ancho, alto, pintar) {
  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = alto
  pintar(canvas.getContext('2d'))
  return { data: canvas.toDataURL('image/png'), formato: 'PNG', ancho, alto }
}

const fotoEjemplo = (n) =>
  dibujo(480, 320, (c) => {
    c.fillStyle = '#e2e8f0'
    c.fillRect(0, 0, 480, 320)
    c.fillStyle = '#475569'
    c.font = 'bold 28px sans-serif'
    c.textAlign = 'center'
    c.fillText(`Foto de ejemplo ${n}`, 240, 170)
  })

const firmaEjemplo = () =>
  dibujo(360, 120, (c) => {
    c.strokeStyle = '#1e293b'
    c.lineWidth = 3
    c.beginPath()
    c.moveTo(30, 80)
    c.bezierCurveTo(80, 10, 110, 120, 160, 60)
    c.bezierCurveTo(200, 20, 220, 110, 330, 45)
    c.stroke()
  })

/** Genera y descarga el PDF de ejemplo. `logo` es el data URL a usar (puede estar vacío). */
export async function descargarEjemplo(config, logo) {
  const [{ generarPdfInforme }, { medirImagen }] = await Promise.all([import('./pdfInforme.js'), import('./imagen.js')])
  const logoMedido = logo ? await medirImagen(logo, { aPng: true }).catch(() => null) : null
  const doc = await generarPdfInforme({ ...datosEjemplo(config), logo: logoMedido, fotos: [fotoEjemplo(1), fotoEjemplo(2)], firma: firmaEjemplo() })
  doc.save('Informe-de-ejemplo.pdf')
}
