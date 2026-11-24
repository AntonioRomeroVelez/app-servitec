<script setup>
import { reactive, ref, computed, watch, onMounted } from 'vue'
import { Plus, KeyRound, Pencil, Phone, MapPin, Mail } from 'lucide-vue-next'
import { useUsuarios } from '../composables/useUsuarios'
import { useAuth, ROLES } from '../composables/useAuth'
import { confirmar } from '../composables/useConfirmar'
import { validarClave, normalizar, generarUsuario } from '../utils'
import { personaVacia, validarPersona, limpiarPersona } from '../persona'
import CampoClave from '../components/CampoClave.vue'
import BarraFiltros from '../components/BarraFiltros.vue'
import Paginador from '../components/Paginador.vue'
import Modal from '../components/Modal.vue'
import FormularioPersona from '../components/FormularioPersona.vue'
import CredencialesNuevas from '../components/CredencialesNuevas.vue'
import { usePaginaLocal } from '../composables/usePaginaLocal'
import { call } from '../api'

const { usuarios, cargando, error, cargar, crear, actualizar } = useUsuarios()
const { usuario: yo, esSuper } = useAuth() // el admin solo ve y gestiona técnicos; el superadmin, a todos

const aviso = ref('')

// El servidor ve todos los usuarios de la plataforma: él sugiere el usuario y dice si uno está libre
const sugerir = (nombre, cedula) => call('usuarios_sugerir', { nombre, cedula })
const disponible = (usuario) => call('usuarios_disponible', { usuario })

// ---------- Alta: el usuario de ingreso se genera de los nombres completos ----------
const nuevo = reactive({ ...personaVacia(), rol: 'tecnico' })
const mostrarForm = ref(false)
const credenciales = ref(null) // { nombre, usuario, clave } tras crear la cuenta (la clave temporal es la cédula)

function abrirAlta() {
  Object.assign(nuevo, personaVacia(), { rol: 'tecnico' })
  aviso.value = ''
  credenciales.value = null
  mostrarForm.value = true
}

async function agregar() {
  aviso.value = validarPersona(nuevo)
  if (aviso.value) return
  try {
    const datos = limpiarPersona(nuevo)
    const u = await crear({ ...datos, usuario: datos.usuario || generarUsuario(datos.nombre, datos.cedula, usuarios.value.map((x) => x.usuario)), rol: nuevo.rol, clave: datos.cedula })
    credenciales.value = { nombre: u.nombre, usuario: u.usuario, clave: datos.cedula }
  } catch {
    /* el error se muestra en el formulario */
  }
}
const cerrarAlta = () => {
  mostrarForm.value = false
  credenciales.value = null
}

// ---------- Edición de los datos de un usuario (el usuario de ingreso no cambia) ----------
const editando = ref(null)
const edicion = reactive({ ...personaVacia(), rol: 'tecnico' })

function abrirEdicion(u) {
  Object.assign(edicion, personaVacia(), { nombre: u.nombre, cedula: u.cedula, correo: u.correo, telefono: u.telefono, ciudad: u.ciudad, direccion: u.direccion, cargo: u.cargo, rol: u.rol })
  editando.value = u
  aviso.value = ''
}

async function guardarEdicion() {
  aviso.value = validarPersona(edicion)
  if (aviso.value) return
  try {
    await actualizar(editando.value.id, { ...limpiarPersona(edicion), ...(editando.value.id === yo.value.id ? {} : { rol: edicion.rol }) })
    editando.value = null
  } catch {
    /* el error se muestra en el formulario */
  }
}

async function alternar(u) {
  const ok = await confirmar(
    u.activo
      ? { titulo: `¿Desactivar a ${u.nombre}?`, texto: 'No podrá ingresar a la app hasta que lo actives de nuevo.', confirmar: 'Desactivar', peligro: true }
      : { titulo: `¿Activar a ${u.nombre}?`, texto: 'Podrá volver a ingresar a la app.', confirmar: 'Activar' },
  )
  if (!ok) return
  actualizar(u.id, { activo: !u.activo }).catch(() => {})
}

// Restablecer clave: si el usuario tiene cédula vuelve a ser su cédula (clave temporal) con un toque; si no la tiene
// (cuentas antiguas), se escribe una clave temporal dentro de la tarjeta.
const restableciendoId = ref(null)
const claveTemporal = ref('')
const claveRestablecida = ref(null) // { nombre, usuario, clave } para entregar tras restablecer

function abrirRestablecer(u) {
  restableciendoId.value = restableciendoId.value === u.id ? null : u.id
  claveTemporal.value = ''
  aviso.value = ''
}

async function restablecer(u) {
  const conCedula = !!u.cedula
  const clave = conCedula ? u.cedula : claveTemporal.value
  if (!conCedula) {
    aviso.value = validarClave(clave, u.usuario)
    if (aviso.value) return
  }
  if (!(await confirmar({ titulo: '¿Restablecer la clave?', texto: `Se cerrarán las sesiones de ${u.nombre} y deberá crear una clave nueva al ingresar.`, confirmar: 'Restablecer', peligro: true }))) return
  try {
    await actualizar(u.id, { clave, temporal: conCedula })
    restableciendoId.value = null
    claveTemporal.value = ''
    claveRestablecida.value = { nombre: u.nombre, usuario: u.usuario, clave }
  } catch {
    /* el error se muestra arriba */
  }
}

// Búsqueda, filtros (rol y estado) y páginas en el dispositivo: la lista llega completa
const q = ref('')
const rol = ref('')
const estado = ref('')
const filtrados = computed(() => {
  const t = normalizar(q.value)
  return usuarios.value.filter(
    (u) =>
      (esSuper.value || u.rol === 'tecnico') &&
      (!rol.value || u.rol === rol.value) &&
      (!estado.value || (estado.value === 'activos') === u.activo) &&
      (!t || [u.nombre, u.usuario, u.correo, u.cedula, u.ciudad, u.telefono].some((c) => normalizar(c).includes(t))),
  )
})
const pag = usePaginaLocal(filtrados, 10)
watch([q, rol, estado], pag.volverAlInicio)

onMounted(() => cargar().catch(() => {}))
</script>

<template>
  <BarraFiltros v-model="q" placeholder="Buscar nombre, usuario, cédula o ciudad" :activos="(rol ? 1 : 0) + (estado ? 1 : 0)">
    <template #filtros>
      <select v-if="esSuper" v-model="rol" class="campo !min-h-10 !py-1.5 text-sm" aria-label="Filtrar por rol">
        <option value="">Todos los roles</option>
        <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
      </select>
      <select v-model="estado" class="campo !min-h-10 !py-1.5 text-sm" aria-label="Filtrar por estado">
        <option value="">Activos e inactivos</option>
        <option value="activos">Solo activos</option>
        <option value="inactivos">Solo inactivos</option>
      </select>
    </template>
    <template #acciones>
      <button class="btn-acento !min-h-10 !px-3 flex-none" aria-label="Nuevo usuario" @click="abrirAlta">
        <Plus :size="18" aria-hidden="true" />
        <span class="sr-only sm:not-sr-only">Nuevo</span>
      </button>
    </template>
  </BarraFiltros>

  <p v-if="(error || aviso) && !mostrarForm && !editando" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ aviso || error }}</p>

  <!-- Alta de usuario (modal) -->
  <Modal v-if="mostrarForm" :titulo="credenciales ? 'Usuario creado' : 'Nuevo usuario'" @cerrar="cerrarAlta">
    <CredencialesNuevas v-if="credenciales" v-bind="credenciales" @listo="cerrarAlta" />
    <form v-else class="grid gap-3" @submit.prevent="agregar">
      <FormularioPersona :form="nuevo" :roles="esSuper ? ROLES : null" nueva-cuenta :usuarios-existentes="usuarios.map((u) => u.usuario)" :sugerir="sugerir" :disponible="disponible" />
      <p v-if="aviso || error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ aviso || error }}</p>
      <button class="btn" :disabled="cargando">{{ cargando ? 'Creando…' : 'Crear usuario' }}</button>
    </form>
  </Modal>

  <!-- Clave restablecida: se entrega al usuario (modal) -->
  <Modal v-if="claveRestablecida" titulo="Clave restablecida" @cerrar="claveRestablecida = null">
    <CredencialesNuevas accion="Clave restablecida" v-bind="claveRestablecida" @listo="claveRestablecida = null" />
  </Modal>

  <!-- Edición de datos (modal) -->
  <Modal v-if="editando" :titulo="`Datos de @${editando.usuario}`" @cerrar="editando = null">
    <form class="grid gap-3" @submit.prevent="guardarEdicion">
      <FormularioPersona :form="edicion" :roles="esSuper && editando.id !== yo.id ? ROLES : null" editando />
      <p class="text-xs text-brand-700/80">El usuario de ingreso (@{{ editando.usuario }}) no cambia aunque se modifique el nombre.</p>
      <p v-if="aviso || error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ aviso || error }}</p>
      <div class="flex gap-2">
        <button type="button" class="btn-borde min-h-11" @click="editando = null">Cancelar</button>
        <button class="btn min-h-11" :disabled="cargando">Guardar</button>
      </div>
    </form>
  </Modal>

  <ul class="grid gap-2.5">
    <li v-for="u in pag.visibles.value" :key="u.id" class="tarjeta grid gap-2" :class="{ 'opacity-60': !u.activo }">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <strong class="text-brand-900">{{ u.nombre }}</strong>
          <p class="text-sm text-brand-700">@{{ u.usuario }}<template v-if="u.cargo"> · {{ u.cargo }}</template></p>
          <p v-if="u.cedula || u.ciudad" class="text-xs text-brand-700/70">
            <template v-if="u.cedula">C.I. {{ u.cedula }}</template><template v-if="u.cedula && u.ciudad"> · </template><template v-if="u.ciudad">{{ u.ciudad }}</template>
          </p>
          <p v-if="u.telefono" class="flex items-center gap-1 text-xs text-brand-700/70"><Phone :size="12" class="shrink-0" aria-hidden="true" />{{ u.telefono }}</p>
          <p v-if="u.correo" class="flex items-center gap-1 text-xs break-all text-brand-700/70"><Mail :size="12" class="shrink-0" aria-hidden="true" />{{ u.correo }}</p>
          <p v-if="u.direccion" class="flex items-center gap-1 text-xs text-brand-700/70"><MapPin :size="12" class="shrink-0" aria-hidden="true" />{{ u.direccion }}</p>
        </div>
        <span class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="u.rol === 'superadmin' ? 'bg-acento text-acento-texto' : 'bg-brand-100 text-brand-800'">{{ u.rol }}</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-borde min-h-10 text-sm" @click="abrirEdicion(u)">
          <Pencil :size="16" aria-hidden="true" />
          Editar datos
        </button>
        <button v-if="u.id !== yo.id" class="btn-borde min-h-10 text-sm" :aria-expanded="restableciendoId === u.id" @click="abrirRestablecer(u)">
          <KeyRound :size="16" aria-hidden="true" />
          Restablecer clave
        </button>
        <button v-if="u.id !== yo.id" class="min-h-10 flex-1 rounded-xl border text-sm font-semibold sm:flex-none sm:px-4" :class="u.activo ? 'border-red-600 text-red-700' : 'border-emerald-600 text-emerald-700'" @click="alternar(u)">
          {{ u.activo ? 'Desactivar' : 'Activar' }}
        </button>
      </div>

      <div v-if="restableciendoId === u.id" class="grid gap-2 rounded-xl bg-brand-50 p-3">
        <template v-if="u.cedula">
          <p class="text-sm text-brand-800">La clave volverá a ser su número de cédula (<b class="font-mono">{{ u.cedula }}</b>). Deberá cambiarla al ingresar y se cerrarán sus sesiones abiertas.</p>
          <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
          <div class="flex gap-2">
            <button type="button" class="btn-borde min-h-11" @click="restableciendoId = null">Cancelar</button>
            <button class="btn min-h-11" :disabled="cargando" @click="restablecer(u)">Restablecer a la cédula</button>
          </div>
        </template>
        <form v-else class="grid gap-2" @submit.prevent="restablecer(u)">
          <label class="etiqueta">Este usuario no tiene cédula: escribe una clave temporal (mínimo 10 caracteres, con letras y números)
            <CampoClave v-model="claveTemporal" autocomplete="new-password" required minlength="10" />
          </label>
          <p class="text-xs text-brand-700/80">Deberá cambiarla al ingresar y se cerrarán sus sesiones abiertas. Agrégale la cédula desde "Editar datos" para usarla como clave temporal.</p>
          <p v-if="aviso" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ aviso }}</p>
          <div class="flex gap-2">
            <button type="button" class="btn-borde min-h-11" @click="restableciendoId = null">Cancelar</button>
            <button class="btn min-h-11" :disabled="cargando">Guardar</button>
          </div>
        </form>
      </div>
    </li>
  </ul>

  <p v-if="!filtrados.length" class="py-8 text-center text-brand-700/70">No hay usuarios que coincidan.</p>
  <Paginador :total="pag.total.value" :offset="pag.offset.value" :limite="pag.limite" @ir="pag.ir" />
</template>
