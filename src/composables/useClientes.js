import { crearRecurso } from './useRecurso'

// Catálogo de clientes (admin y superadmin): por nombre. Se alimenta solo al registrar visitas y también se puede editar.
export const useClientes = crearRecurso('clientes', (a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
