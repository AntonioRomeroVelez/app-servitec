// Genera el PDF del informe (A4) como un archivo real: encabezado con el logo y los datos de la empresa, datos del
// informe, checklist, observaciones, fotografías, firma del cliente y un pie en todas las páginas con su numeración.
// Es independiente del navegador (recibe imágenes ya medidas), así que se puede probar en Node.
// jsPDF se carga al pedir el PDF (no pesa en el arranque de la app).
import { fechaCorta } from './utils.js'

const ANCHO = 210
const ALTO = 297
const M = 15 // margen
const UTIL = ANCHO - 2 * M
const PIE_ALTO = 20 // espacio reservado abajo para el pie

const OSCURO = [30, 41, 59]
const GRIS = [100, 116, 139]
const LINEA = [226, 232, 240]
const COLOR_RESULTADO = { ok: [4, 120, 87], falla: [185, 28, 28], na: [71, 85, 105] }
const TEXTO_RESULTADO = { ok: 'Cumple', falla: 'Falla', na: 'N/A' }
const COLOR_ESTADO = { Borrador: [100, 116, 139], 'En revisión': [180, 83, 9], Finalizado: [4, 120, 87] }

const hexARgb = (hex) => {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#1565d8'
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
}

/**
 * @param {object} d
 * @param {object} d.informe        informe completo (titulo, numero, fecha, cliente, tipo, estado, responsable, autor, descripcion, firma, firmante)
 * @param {object} d.empresa        { nombre, subtitulo, ruc, direccion, telefono, correo, web, pie }
 * @param {string} d.colorPrimario  #rrggbb de la marca
 * @param {object|null} d.logo      { data, formato, ancho, alto } ya medido, o null
 * @param {Array}  d.checklist      [{ item, resultado, obs }]
 * @param {Array}  d.fotos          [{ data, formato, ancho, alto }]
 * @param {object|null} d.firma     { data, formato, ancho, alto } o null
 * @param {object} d.opciones       { pdfChecklist, pdfFotos, pdfFirma, pdfObservaciones }
 * @returns jsPDF (usa .save(nombre) o .output('blob'))
 */
export async function generarPdfInforme(d) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const { informe, empresa, logo, checklist = [], fotos = [], firma = null, opciones = {} } = d
  const primario = hexARgb(d.colorPrimario)
  let y = M

  const texto = (t, x, yy, opc) => doc.text(String(t), x, yy, opc)
  const fuente = (estilo, tam, color = OSCURO) => {
    doc.setFont('helvetica', estilo)
    doc.setFontSize(tam)
    doc.setTextColor(...color)
  }
  const envolver = (t, ancho) => doc.splitTextToSize(String(t ?? ''), ancho)
  const asegurar = (alto) => {
    if (y + alto > ALTO - PIE_ALTO) {
      doc.addPage()
      y = M
    }
  }
  const escalar = (img, maxAncho, maxAlto) => {
    const k = Math.min(maxAncho / img.ancho, maxAlto / img.alto)
    return { w: img.ancho * k, h: img.alto * k }
  }
  const titulo = (t) => {
    asegurar(12)
    doc.setFillColor(...primario)
    doc.rect(M, y, 1.2, 5, 'F')
    fuente('bold', 11, primario)
    texto(t, M + 3.5, y + 4)
    y += 8
  }

  // ---------------- Encabezado: logo + nombre a la izquierda, número y fecha a la derecha ----------------
  const altoEnc = 16
  let x = M
  if (logo) {
    const { w, h } = escalar(logo, 46, altoEnc)
    doc.addImage(logo.data, logo.formato || 'PNG', M, y + (altoEnc - h) / 2, w, h)
    x = M + w + 4
  }
  if (!logo || empresa.nombre) {
    fuente('bold', logo ? 13 : 19, primario)
    texto(empresa.nombre || '', x, y + (empresa.subtitulo ? 8 : 10))
    if (empresa.subtitulo) {
      fuente('bold', 7, GRIS)
      texto(String(empresa.subtitulo).toUpperCase(), x, y + 13, { charSpace: 1 })
    }
  }
  fuente('bold', 12, OSCURO)
  texto(informe.numero || 'Sin número', ANCHO - M, y + 7, { align: 'right' })
  fuente('normal', 9, GRIS)
  texto(fechaCorta(informe.fecha), ANCHO - M, y + 12, { align: 'right' })
  y += altoEnc + 3
  doc.setDrawColor(...primario)
  doc.setLineWidth(0.8)
  doc.line(M, y, ANCHO - M, y)
  y += 3

  const datosEmpresa = [empresa.ruc && `RUC ${empresa.ruc}`, empresa.direccion, empresa.telefono && `Tel. ${empresa.telefono}`, empresa.correo, empresa.web].filter(Boolean).join('  |  ')
  if (datosEmpresa) {
    fuente('normal', 8, GRIS)
    const lineas = envolver(datosEmpresa, UTIL)
    texto(lineas, M, y + 3)
    y += lineas.length * 3.5 + 2
  }
  y += 5

  // ---------------- Título y estado ----------------
  fuente('bold', 15, OSCURO)
  const lineasTitulo = envolver(informe.titulo || 'Informe técnico', UTIL - 34)
  texto(lineasTitulo, M, y + 5)
  const colorEstado = COLOR_ESTADO[informe.estado] || GRIS
  fuente('bold', 8.5, colorEstado)
  const anchoEstado = doc.getTextWidth(informe.estado || '') + 8
  doc.setDrawColor(...colorEstado)
  doc.setLineWidth(0.4)
  doc.roundedRect(ANCHO - M - anchoEstado, y, anchoEstado, 7, 3.5, 3.5, 'S')
  texto(informe.estado || '', ANCHO - M - anchoEstado / 2, y + 4.7, { align: 'center' })
  y += lineasTitulo.length * 6.2 + 4

  // ---------------- Datos del informe (recuadro de dos columnas) ----------------
  const filas = [
    ['Cliente', informe.cliente],
    ['Fecha', fechaCorta(informe.fecha)],
    ['Tipo de visita', informe.tipo],
    ['Responsable', informe.responsable || '-'],
    ['Elaborado por', informe.autor],
  ]
  const colAncho = UTIL / 2 - 4
  const alturas = filas.map(([, v]) => Math.max(1, envolver(v, colAncho - 28).length) * 4.2 + 1.8)
  const filasIzq = [0, 2, 4]
  const filasDer = [1, 3]
  const altoCaja = Math.max(filasIzq.reduce((a, i) => a + alturas[i], 0), filasDer.reduce((a, i) => a + alturas[i], 0)) + 5
  asegurar(altoCaja + 6)
  doc.setFillColor(241, 245, 249)
  doc.roundedRect(M, y, UTIL, altoCaja, 2, 2, 'F')
  for (const [col, indices] of [[0, filasIzq], [1, filasDer]]) {
    let yy = y + 5.5
    const x0 = M + 4 + col * (UTIL / 2)
    for (const i of indices) {
      fuente('normal', 8.5, GRIS)
      texto(filas[i][0], x0, yy)
      fuente('bold', 9.5, OSCURO)
      texto(envolver(filas[i][1], colAncho - 28), x0 + 28, yy)
      yy += alturas[i]
    }
  }
  y += altoCaja + 6

  // ---------------- Checklist ----------------
  if (opciones.pdfChecklist !== false && checklist.length) {
    titulo('Checklist')
    const resumen = { ok: 0, falla: 0, na: 0 }
    for (const c of checklist) if (resumen[c.resultado] !== undefined) resumen[c.resultado]++
    fuente('normal', 8.5, GRIS)
    texto(`${resumen.ok} cumplen  |  ${resumen.falla} fallas  |  ${resumen.na} no aplican`, M, y)
    y += 4
    for (const c of checklist) {
      const lineasItem = envolver(c.item, UTIL - 32)
      const lineasObs = c.obs ? envolver(`Obs.: ${c.obs}`, UTIL - 32) : []
      const alto = lineasItem.length * 4.4 + lineasObs.length * 3.8 + 3.2
      asegurar(alto)
      fuente('normal', 9.5, OSCURO)
      texto(lineasItem, M + 1, y + 4)
      if (lineasObs.length) {
        fuente('italic', 8.5, GRIS)
        texto(lineasObs, M + 1, y + 4 + lineasItem.length * 4.4)
      }
      fuente('bold', 9.5, COLOR_RESULTADO[c.resultado] || GRIS)
      texto(TEXTO_RESULTADO[c.resultado] || 'Sin responder', ANCHO - M - 1, y + 4, { align: 'right' })
      y += alto
      doc.setDrawColor(...LINEA)
      doc.setLineWidth(0.2)
      doc.line(M, y - 0.8, ANCHO - M, y - 0.8)
    }
    y += 5
  }

  // ---------------- Observaciones ----------------
  if (opciones.pdfObservaciones !== false) {
    titulo('Observaciones')
    fuente('normal', 10, OSCURO)
    for (const linea of envolver(informe.descripcion || 'Sin observaciones.', UTIL)) {
      asegurar(5)
      texto(linea, M, y + 3.5)
      y += 4.9
    }
    y += 5
  }

  // ---------------- Fotografías (dos columnas) ----------------
  if (opciones.pdfFotos !== false && fotos.length) {
    titulo('Fotografías')
    const celda = (UTIL - 4) / 2
    for (let i = 0; i < fotos.length; i += 2) {
      const fila = fotos.slice(i, i + 2).map((f) => ({ f, ...escalar(f, celda, 70) }))
      const alto = Math.max(...fila.map((e) => e.h))
      asegurar(alto + 4)
      fila.forEach((e, j) => {
        const x0 = M + j * (celda + 4)
        doc.addImage(e.f.data, e.f.formato || 'JPEG', x0, y, e.w, e.h)
        doc.setDrawColor(...LINEA)
        doc.setLineWidth(0.2)
        doc.rect(x0, y, e.w, e.h, 'S')
      })
      y += alto + 4
    }
    y += 2
  }

  // ---------------- Firma del cliente ----------------
  if (opciones.pdfFirma !== false && (firma || informe.firmante)) {
    asegurar(48)
    titulo('Conformidad del cliente')
    if (firma) {
      const { w, h } = escalar(firma, 62, 26)
      doc.addImage(firma.data, firma.formato || 'PNG', M, y, w, h)
      y += h + 1
    } else {
      y += 18
    }
    doc.setDrawColor(...GRIS)
    doc.setLineWidth(0.3)
    doc.line(M, y, M + 70, y)
    fuente('normal', 9.5, OSCURO)
    if (informe.firmante) texto(informe.firmante, M, y + 5)
    fuente('normal', 8, GRIS)
    texto('Firma del cliente', M, y + (informe.firmante ? 9 : 5))
    y += 12
  }

  // ---------------- Pie en todas las páginas ----------------
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(...primario)
    doc.setLineWidth(0.4)
    doc.line(M, ALTO - 17, ANCHO - M, ALTO - 17)
    if (empresa.pie) {
      fuente('normal', 7.5, GRIS)
      texto(envolver(empresa.pie, UTIL).slice(0, 2), ANCHO / 2, ALTO - 13.5, { align: 'center' })
    }
    fuente('normal', 7.5, GRIS)
    texto(`${empresa.nombre || ''}  -  ${informe.numero || ''}`, M, ALTO - 7)
    texto(`Página ${p} de ${total}`, ANCHO - M, ALTO - 7, { align: 'right' })
  }
  return doc
}

/** Nombre del archivo: INF-0001.pdf (o el título si aún no tiene número). */
export const nombreArchivoPdf = (informe) =>
  `${String(informe.numero || informe.titulo || 'informe').replace(/[\\/:*?"<>|\s]+/g, '_')}.pdf`
