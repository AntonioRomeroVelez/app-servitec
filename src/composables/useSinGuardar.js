import { onBeforeUnmount } from 'vue'
import { confirmar } from './useConfirmar'

// Aviso "¿Salir sin guardar?". Cada formulario se registra mientras está en pantalla; al cerrarlo o al navegar se
// pregunta solo si tiene cambios.
const registrados = new Set() // { hayCambios, descartar }

const preguntar = () => confirmar({ titulo: '¿Salir sin guardar?', texto: 'Lo que escribiste se perderá.', confirmar: 'Descartar', peligro: true })

/**
 * Registra un formulario. `descartar` hace falta si el formulario puede seguir en pantalla después de navegar.
 * Devuelve `salir()`, para sus botones de cerrar: true si no hay cambios o si la persona acepta perderlos.
 */
export function useSinGuardar(hayCambios, descartar) {
  const formulario = { hayCambios, descartar }
  registrados.add(formulario)
  onBeforeUnmount(() => registrados.delete(formulario))
  return async () => !hayCambios() || preguntar()
}

/** Para navegar o cerrar sesión: revisa todos los formularios abiertos y, si se acepta, descarta sus cambios. */
export async function puedeSalir() {
  const conCambios = [...registrados].filter((f) => f.hayCambios())
  if (!conCambios.length) return true
  if (!(await preguntar())) return false
  conCambios.forEach((f) => f.descartar?.())
  return true
}
