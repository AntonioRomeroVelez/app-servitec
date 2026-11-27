import { ref, readonly } from 'vue'
import { call } from '../api'

const tecnicos = ref([]) // [{ usuario, nombre }]

export function useTecnicos() {
  const poner = (lista) => (tecnicos.value = lista)
  const cargar = async () => poner(await call('tecnicos_list', {}, { previo: poner }))
  const limpiar = () => (tecnicos.value = [])
  const nombreDe = (usuario) => tecnicos.value.find((t) => t.usuario === usuario)?.nombre || usuario
  return { tecnicos: readonly(tecnicos), cargar, limpiar, nombreDe }
}
