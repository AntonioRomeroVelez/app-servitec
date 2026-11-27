// Cuántas consultas al servidor están en curso: la barra de carga se muestra mientras haya alguna.
import { ref } from 'vue'

export const consultas = ref(0)

/** Marca el inicio de una consulta y devuelve la función que la da por terminada (solo cuenta una vez). */
export function empezarCarga() {
  consultas.value++
  let abierta = true
  return () => {
    if (!abierta) return
    abierta = false
    consultas.value--
  }
}
