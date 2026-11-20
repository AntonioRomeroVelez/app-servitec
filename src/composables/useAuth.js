import { ref, computed, readonly } from 'vue'
import { call, setAuthHandler, setClaveHandler, limpiarDatosLocales, SESION_KEY } from '../api'

export const ROLES = ['tecnico', 'admin', 'superadmin']

function cargarSesion() {
  try {
    return JSON.parse(localStorage.getItem(SESION_KEY))
  } catch {
    return null
  }
}

const sesion = ref(cargarSesion())

function guardar(res) {
  sesion.value = res
  localStorage.setItem(SESION_KEY, JSON.stringify(res))
}

function cerrar() {
  sesion.value = null
  localStorage.removeItem(SESION_KEY)
  limpiarDatosLocales()
}
setAuthHandler(cerrar) // el backend respondió AUTH (token vencido o sesión cerrada en otro lado): se cierra la sesión

// El backend exige cambiar la clave (p. ej. sesión guardada de antes de que se restableciera): se muestra la pantalla obligatoria
setClaveHandler(() => {
  if (sesion.value) guardar({ ...sesion.value, usuario: { ...sesion.value.usuario, cambiarClave: true } })
})

export function useAuth() {
  const usuario = computed(() => sesion.value?.usuario ?? null)
  const esSuper = computed(() => usuario.value?.rol === 'superadmin')
  const puedeAgendar = computed(() => usuario.value?.rol === 'admin' || usuario.value?.rol === 'superadmin')

  async function login(user, clave) {
    guardar(await call('login', { usuario: user.trim(), clave }))
  }

  // Alta de una empresa nueva (SaaS): crea la cuenta, la empresa y su superadmin, y deja la sesión abierta
  async function registrar(datos) {
    guardar(await call('registrar', datos))
  }

  // Cambio de clave propio: el servidor devuelve un token nuevo (las demás sesiones se cierran)
  async function cambiarMiClave(actual, nueva) {
    guardar(await call('cambiar_clave', { actual, nueva }))
  }

  // Invalida el token también en el servidor; la sesión local se cierra de inmediato aunque no haya red
  function logout() {
    call('logout').catch(() => {})
    cerrar()
  }

  return { usuario: readonly(usuario), esSuper, puedeAgendar, logueado: computed(() => !!sesion.value), login, registrar, cambiarMiClave, logout }
}
