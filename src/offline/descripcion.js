// Texto legible de un cambio en cola (para la pantalla de pendientes)
export function describir(op) {
  const d = op.payload?.data || {}
  switch (op.action) {
    case 'visitas_create':
      return `Nueva visita: ${d.cliente || ''}`
    case 'visitas_update':
      return d.estado ? `Visita: cambiar estado a "${d.estado}"` : 'Visita: guardar cambios'
    case 'informes_create':
      return `Nuevo informe: ${d.titulo || ''}`
    case 'informes_update':
      return d.estado === 'Finalizado' ? 'Informe: finalizar' : 'Informe: guardar cambios'
    case 'informes_delete':
      return 'Informe: eliminar'
    case 'fotos_upload':
      return 'Foto de una visita'
    case 'fotos_delete':
      return 'Foto: eliminar'
    default:
      return op.action
  }
}
