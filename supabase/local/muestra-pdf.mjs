// Genera un PDF de muestra en la ruta indicada (para revisar el diseño). Uso: node supabase/local/muestra-pdf.mjs salida.pdf
import { readFileSync, writeFileSync } from 'node:fs'
import { generarPdfInforme } from '../../src/pdfInforme.js'
const png = (a, ancho, alto) => ({ data: `data:image/png;base64,${readFileSync(new URL(`../../public/${a}`, import.meta.url)).toString('base64')}`, formato: 'PNG', ancho, alto })
const doc = await generarPdfInforme({
  informe: { numero: 'INF-0007', titulo: 'Mantenimiento preventivo de cámaras de seguridad', fecha: '2026-11-20', cliente: 'Ferretería Sol', tipo: 'Mantenimiento', estado: 'Finalizado', responsable: 'tecnico1', autor: 'tecnico1', firmante: 'María Pérez', descripcion: 'Se revisó el sistema completo de videovigilancia. Se limpiaron los lentes y se verificó el almacenamiento de las grabaciones. '.repeat(6) },
  empresa: { nombre: 'Seguridad Norte S.A.', subtitulo: 'Soluciones de seguridad', ruc: '1790000000001', direccion: 'Av. Principal 123 y Calle 5, Quito', telefono: '022222222', correo: 'info@norte.test', web: 'www.norte.test', pie: 'Seguridad Norte S.A. - Gracias por confiar en nosotros' },
  colorPrimario: '#1565d8', logo: png('icon-512.png', 512, 512),
  checklist: Array.from({ length: 14 }, (_, i) => ({ item: `Elemento de revisión número ${i + 1} del sistema`, resultado: ['ok', 'falla', 'na'][i % 3], obs: i % 3 === 1 ? 'Se encontró una falla que requiere seguimiento posterior' : '' })),
  fotos: [png('icon-192.png', 192, 192), png('icon-512.png', 512, 512), png('icon-192.png', 192, 192)], firma: png('icon-192.png', 192, 192), opciones: {},
})
writeFileSync(process.argv[2], Buffer.from(doc.output('arraybuffer')))
console.log('páginas:', doc.getNumberOfPages())
