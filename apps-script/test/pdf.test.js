// Generación del PDF del informe (jsPDF en Node, sin navegador): estructura, paginación y opciones de contenido.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generarPdfInforme, nombreArchivoPdf } from '../../src/pdfInforme.js'

const png = (archivo) => ({ data: `data:image/png;base64,${readFileSync(new URL(`../../public/${archivo}`, import.meta.url)).toString('base64')}`, formato: 'PNG', ancho: 512, alto: 512 })
const logo = { ...png('icon-512.png'), ancho: 300, alto: 100 }

const informe = {
  numero: 'INF-0007', titulo: 'Mantenimiento preventivo de cámaras', fecha: '2026-11-20', cliente: 'Ferretería Sol', tipo: 'Mantenimiento',
  estado: 'Finalizado', responsable: 'tecnico1', autor: 'tecnico1', firmante: 'María Pérez',
  descripcion: 'Se revisó el sistema completo. '.repeat(40),
}
const empresa = { nombre: 'Seguridad Norte S.A.', subtitulo: 'Soluciones de seguridad', ruc: '1790000000001', direccion: 'Av. Principal 123 y Calle 5, Quito', telefono: '022222222', correo: 'info@norte.test', web: 'www.norte.test', pie: 'Seguridad Norte S.A. - Gracias por confiar en nosotros' }
const checklist = (n) => Array.from({ length: n }, (_, i) => ({ item: `Elemento de revisión número ${i + 1} del sistema`, resultado: ['ok', 'falla', 'na'][i % 3], obs: i % 3 === 1 ? 'Se encontró una falla que requiere seguimiento posterior' : '' }))
const base = { informe, empresa, colorPrimario: '#1565d8', logo, checklist: checklist(40), fotos: [png('icon-192.png'), png('icon-512.png'), png('icon-192.png'), png('icon-512.png'), png('icon-192.png')], firma: png('icon-192.png'), opciones: {} }
const bytes = (doc) => Buffer.from(doc.output('arraybuffer'))

test('genera un PDF válido de varias páginas con pie numerado', async () => {
  const doc = await generarPdfInforme(base)
  const b = bytes(doc)
  assert.equal(b.subarray(0, 5).toString(), '%PDF-')
  assert.ok(doc.getNumberOfPages() >= 3, `páginas: ${doc.getNumberOfPages()}`)
  assert.ok(b.length > 5000)
})

test('un informe corto cabe en una página', async () => {
  const doc = await generarPdfInforme({ ...base, checklist: checklist(3), fotos: [], descripcion: undefined, informe: { ...informe, descripcion: 'Todo en orden.' } })
  assert.equal(doc.getNumberOfPages(), 1)
})

test('sin logo ni datos opcionales no falla', async () => {
  const doc = await generarPdfInforme({ ...base, logo: null, firma: null, fotos: [], empresa: { nombre: 'Solo Nombre' }, informe: { ...informe, firmante: '', responsable: '', numero: '' } })
  assert.equal(bytes(doc).subarray(0, 5).toString(), '%PDF-')
})

test('las opciones de contenido quitan secciones (el PDF queda más corto)', async () => {
  const completo = await generarPdfInforme(base)
  const reducido = await generarPdfInforme({ ...base, opciones: { pdfChecklist: false, pdfFotos: false, pdfFirma: false, pdfObservaciones: false } })
  assert.ok(reducido.getNumberOfPages() < completo.getNumberOfPages())
  assert.equal(reducido.getNumberOfPages(), 1)
})

test('nombre del archivo a partir del número del informe', () => {
  assert.equal(nombreArchivoPdf({ numero: 'INF-0007' }), 'INF-0007.pdf')
  assert.equal(nombreArchivoPdf({ titulo: 'Revisión / cámaras' }), 'Revisión_cámaras.pdf')
})
