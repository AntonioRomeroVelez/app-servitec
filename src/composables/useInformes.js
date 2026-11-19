import { crearRecurso } from './useRecurso'

// Los tipos de visita los define el superadmin en Ajustes (ver useConfiguracion)
export const ESTADOS = ['Borrador', 'En revisión', 'Finalizado']

// Más recientes primero
export const useInformes = crearRecurso('informes', (a, b) => String(b.fecha).localeCompare(String(a.fecha)))
