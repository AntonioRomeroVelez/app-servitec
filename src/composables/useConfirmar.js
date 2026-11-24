// Confirmación antes de un cambio importante (desactivar, eliminar, restablecer…). Usa SweetAlert2, cargado solo cuando
// hace falta para no pesar en el arranque. Devuelve una promesa: true si la persona confirma, false si cancela o cierra.
// No lleva icono dibujado (la regla del proyecto es usar solo Lucide); los botones usan las clases de la app.
export async function confirmar({ titulo = '¿Confirmas el cambio?', texto = '', confirmar: etiqueta = 'Confirmar', peligro = false } = {}) {
  const { default: Swal } = await import('sweetalert2')
  const r = await Swal.fire({
    title: titulo,
    text: texto,
    showCancelButton: true,
    confirmButtonText: etiqueta,
    cancelButtonText: 'Cancelar',
    reverseButtons: true,
    focusCancel: peligro, // en acciones destructivas el foco queda en Cancelar para no confirmar por accidente con Enter
    buttonsStyling: false,
    width: 'min(26rem, 92vw)',
    customClass: {
      popup: '!rounded-2xl !p-5 !font-sans',
      title: '!p-0 !text-lg !font-bold !text-brand-900',
      htmlContainer: '!mx-0 !mt-2 !text-sm !text-brand-800',
      actions: '!mt-4 !w-full !flex-nowrap !gap-2',
      confirmButton: peligro ? 'btn !min-w-0 !bg-red-600 active:!bg-red-700' : 'btn !min-w-0',
      cancelButton: 'btn-borde !min-w-0',
    },
  })
  return r.isConfirmed
}
