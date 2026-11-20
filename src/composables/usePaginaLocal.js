import { ref, computed, watch } from 'vue'

/**
 * Paginación en el dispositivo para listas que llegan completas (usuarios, empresas, notificaciones).
 * `lista` es una ref/computed con los elementos ya filtrados; al cambiar el filtro vuelve a la primera página.
 */
export function usePaginaLocal(lista, limite = 10) {
  const offset = ref(0)
  watch(
    () => lista.value.length,
    (n) => {
      if (offset.value >= n) offset.value = Math.max(0, Math.floor((n - 1) / limite) * limite)
    },
  )
  const visibles = computed(() => lista.value.slice(offset.value, offset.value + limite))
  const volverAlInicio = () => (offset.value = 0)
  return { offset, limite, total: computed(() => lista.value.length), visibles, ir: (o) => (offset.value = o), volverAlInicio }
}
