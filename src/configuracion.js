// Valores por defecto de la configuración que el superadmin puede personalizar (empresa, colores, logo, informes, tipos de
// visita con su checklist). Deben coincidir con CONFIG_DEFECTO de apps-script/Code.gs: una prueba lo comprueba.
export const CONFIG_DEFECTO = {
  empresa: { nombre: 'FERISEL', subtitulo: 'SECURITY SOLUTIONS', ruc: '', direccion: '', telefono: '', correo: '', web: '', pie: '' },
  tema: { primario: '#1565d8', acento: '#f6c915' },
  logo: '',
  informes: { prefijo: 'INF', pdfChecklist: true, pdfFotos: true, pdfFirma: true, pdfObservaciones: true },
  tipos: [
    { nombre: 'Visita técnica', checklist: ['Estado general de las cámaras', 'Imagen y enfoque de cada cámara', 'Estado del grabador (DVR/NVR)', 'Almacenamiento y grabaciones', 'Cableado y conectores', 'Alimentación eléctrica / UPS', 'Acceso remoto (app / red)'] },
    { nombre: 'Inspección', checklist: ['Cobertura de cámaras y puntos ciegos', 'Estado de sensores y alarmas', 'Panel de control y sirena', 'Iluminación en zonas vigiladas', 'Señalización de seguridad'] },
    { nombre: 'Mantenimiento', checklist: ['Limpieza de lentes y carcasas', 'Revisión de fijaciones y soportes', 'Prueba de grabación y reproducción', 'Actualización de firmware', 'Prueba de alarma y notificaciones', 'Respaldo de configuración'] },
    { nombre: 'Incidente', checklist: ['Evento verificado con el cliente', 'Grabaciones del evento revisadas', 'Equipos afectados identificados', 'Acción correctiva realizada', 'Cliente informado'] },
    { nombre: 'Otro', checklist: [] },
  ],
}

export const clonar = (o) => JSON.parse(JSON.stringify(o))

// Une una configuración recibida (del servidor o guardada en el dispositivo) con los valores por defecto, por si falta algo
export function combinar(cfg) {
  const base = clonar(CONFIG_DEFECTO)
  if (!cfg || typeof cfg !== 'object') return base
  for (const k of ['empresa', 'tema', 'informes']) if (cfg[k] && typeof cfg[k] === 'object') base[k] = { ...base[k], ...cfg[k] }
  if (typeof cfg.logo === 'string') base.logo = cfg.logo
  if (Array.isArray(cfg.tipos) && cfg.tipos.length) base.tipos = cfg.tipos
  return base
}
