// Datos que se piden de cada persona (usuarios y administrador de una empresa) y su validación.
// El usuario de ingreso se sugiere (primer nombre + últimos 4 dígitos de la cédula, ver generarUsuario en utils.js) y la persona
// puede cambiarlo al crear la cuenta; si se deja vacío, el servidor usa el sugerido.
import { motivoCedulaInvalida, telefonoValido, correoValido, usuarioValido } from './utils'

export const personaVacia = () => ({ usuario: '', nombre: '', cedula: '', correo: '', telefono: '', ciudad: '', direccion: '', cargo: '' })

/** Campos de la persona tal como se envían al servidor (sin espacios sobrantes). */
export const limpiarPersona = (p) =>
  Object.fromEntries(Object.keys(personaVacia()).map((k) => [k, k === 'usuario' ? String(p[k] ?? '').trim().toLowerCase() : String(p[k] ?? '').trim()]))

/**
 * Devuelve el mensaje del primer dato inválido, o '' si todo está bien. La clave temporal de una cuenta nueva es la cédula
 * (ya validada aquí), por eso no se pide ni se valida otra.
 */
export function validarPersona(p) {
  const d = limpiarPersona(p)
  if (d.nombre.split(/\s+/).filter(Boolean).length < 2) return 'Escribe los nombres completos (nombres y apellidos)'
  const motivoCedula = motivoCedulaInvalida(d.cedula)
  if (motivoCedula) return motivoCedula
  if (!correoValido(d.correo)) return 'El correo no es válido'
  if (!telefonoValido(d.telefono)) return 'El teléfono no es válido (de 7 a 15 dígitos)'
  if (!d.ciudad) return 'Escribe la ciudad'
  if (d.usuario && !usuarioValido(d.usuario)) return 'Usuario inválido: de 3 a 30 caracteres (letras minúsculas, números, punto, guion o guion bajo)'
  return ''
}
