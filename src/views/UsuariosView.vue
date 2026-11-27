<script setup>
import BotonNuevo from '../components/BotonNuevo.vue'
import Cargando from '../components/Cargando.vue'
import Vacio from '../components/Vacio.vue'
import PieFormulario from '../components/PieFormulario.vue'
import { reactive, ref, computed, watch, onMounted } from 'vue'
import { KeyRound, Pencil, Power, Trash2, Users, Phone, MapPin, Mail, IdCard, Briefcase } from 'lucide-vue-next'
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
import { useSinGuardar } from '../composables/useSinGuardar'
import Avatar from '../components/Avatar.vue'
import Dato from '../components/Dato.vue'
import { ETIQUETA_ROL, CLASE_ROL } from '../estados'

const { usuarios, cargando, error, cargar, crear, actualizar, eliminar } = useUsuarios()
const { usuario: yo, esSuper } = useAuth()
// El superadmin gestiona a los administradores; el admin, a administradores y técnicos (no ve a los superadmins).
// La cuenta del propietario solo la cambian él mismo y el superadmin.
const rolesPermitidos = computed(() => ROLES.filter((r) => (esSuper.value ? r === 'admin' : r !== 'superadmin')))
const puedeCambiar = (u) => u.id === yo.value.id || esSuper.value || !u.propietario

const aviso = ref('')
const persona = computed(() => (esSuper.value ? 'administrador' : 'usuario')) // el superadmin solo ve administradores

// El servidor ve todos los usuarios de la plataforma: él sugiere el usuario y dice si uno está libre
const sugerir = (nombre, cedula) => call('usuarios_sugerir', { nombre, cedula })
const disponible = (usuario) => call('usuarios_disponible', { usuario })

// ---------- Alta: el usuario de ingreso se genera de los nombres completos ----------
const nuevo = reactive({ ...personaVacia(), rol: 'tecnico' })
const mostrarForm = ref(false)
const credenciales = ref(null) // { nombre, usuario, clave } tras crear la cuenta (la clave temporal es la cédula)
let altaOriginal = ''
const salirDeAlta = useSinGuardar(() => mostrarForm.value && !credenciales.value && JSON.stringify(nuevo) !== altaOriginal)

function abrirAlta() {
  Object.assign(nuevo, personaVacia(), { rol: rolesPermitidos.value[0] })
  altaOriginal = JSON.stringify(nuevo)
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
const cerrarAlta = async () => {
  if (!(await salirDeAlta())) return
  mostrarForm.value = false
  credenciales.value = null
}

// ---------- Edición de los datos de un usuario (el usuario de ingreso no cambia) ----------
const editando = ref(null)
const edicion = reactive({ ...personaVacia(), rol: 'tecnico' })
let edicionOriginal = ''
const salirDeEdicion = useSinGuardar(() => !!editando.value && JSON.stringify(edicion) !== edicionOriginal)
const cerrarEdicion = async () => (await salirDeEdicion()) && (editando.value = null)

function abrirEdicion(u) {
  Object.assign(edicion, personaVacia(), { nombre: u.nombre, cedula: u.cedula, correo: u.correo, telefono: u.telefono, ciudad: u.ciudad, direccion: u.direccion, cargo: u.cargo, rol: u.rol })
  edicionOriginal = JSON.stringify(edicion)
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

async function borrar(u) {
  if (!(await confirmar({ titulo: `¿Eliminar a ${u.nombre}?`, texto: 'No podrá ingresar y dejará de aparecer en la lista. Sus visitas e informes se conservan. Esta acción no se puede deshacer.', confirmar: 'Eliminar', peligro: true }))) return
  aviso.value = ''
  eliminar(u.id).catch(() => {})
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
      (rolesPermitidos.value.includes(u.rol) || u.id === yo.value.id) &&
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
  <BarraFiltros v-model="q" placeholder="Buscar usuario" :activos="(rol ? 1 : 0) + (estado ? 1 : 0)">
    <template #filtros>
      <select v-model="rol" class="campo !min-h-10 !py-1.5 text-sm" aria-label="Filtrar por rol">
        <option value="">Todos los roles</option>
        <option v-for="r in rolesPermitidos" :key="r" :value="r">{{ r }}</option>
      </select>
      <select v-model="estado" class="campo !min-h-10 !py-1.5 text-sm" aria-label="Filtrar por estado">
        <option value="">Activos e inactivos</option>
        <option value="activos">Solo activos</option>
        <option value="inactivos">Solo inactivos</option>
      </select>
    </template>
  </BarraFiltros>

  <p v-if="(error || aviso) && !mostrarForm && !editando" class="aviso-error mb-3">{{ aviso || error }}</p>

  <!-- Alta de usuario (modal) -->
  <Modal v-if="mostrarForm" :titulo="credenciales ? (esSuper ? 'Administrador creado' : 'Usuario creado') : `Nuevo ${persona}`" @cerrar="cerrarAlta">
    <CredencialesNuevas v-if="credenciales" v-bind="credenciales" @listo="cerrarAlta" />
    <form v-else @submit.prevent="agregar">
      <FormularioPersona :form="nuevo" :roles="rolesPermitidos" nueva-cuenta :usuarios-existentes="usuarios.map((u) => u.usuario)" :sugerir="sugerir" :disponible="disponible" />
      <PieFormulario :texto="`Crear ${persona}`" :cargando="cargando" :error="aviso || error || ''" @cancelar="cerrarAlta" />
    </form>
  </Modal>

  <!-- Clave restablecida: se entrega al usuario (modal) -->
  <Modal v-if="claveRestablecida" titulo="Clave restablecida" @cerrar="claveRestablecida = null">
    <CredencialesNuevas accion="Clave restablecida" v-bind="claveRestablecida" @listo="claveRestablecida = null" />
  </Modal>

  <!-- Edición de datos (modal) -->
  <Modal v-if="editando" :titulo="`Datos de @${editando.usuario}`" @cerrar="cerrarEdicion">
    <form @submit.prevent="guardarEdicion">
      <FormularioPersona :form="edicion" :roles="editando.id !== yo.id ? rolesPermitidos : null" editando />
      <p class="text-xs text-brand-700/80">El usuario de ingreso (@{{ editando.usuario }}) no cambia aunque se modifique el nombre.</p>
      <PieFormulario texto="Guardar cambios" :cargando="cargando" :error="aviso || error || ''" @cancelar="cerrarEdicion" />
    </form>
  </Modal>

  <ul class="grid gap-2.5 lg:grid-cols-[repeat(auto-fit,minmax(24rem,1fr))]">
    <li v-for="u in pag.visibles.value" :key="u.id" class="tarjeta grid gap-2" :class="{ 'opacity-60': !u.activo }">
      <div class="flex items-start gap-3">
        <Avatar :nombre="u.nombre" :inactivo="!u.activo" />
        <div class="grid min-w-0 flex-1 gap-0.5">
          <strong class="text-base leading-snug wrap-anywhere text-brand-900">{{ u.nombre }}</strong>
          <p class="text-sm text-brand-700">@{{ u.usuario }}</p>
        </div>
        <span class="flex shrink-0 flex-col items-end gap-1">
          <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="CLASE_ROL[u.rol] || 'bg-brand-100 text-brand-800'">{{ ETIQUETA_ROL[u.rol] || u.rol }}</span>
          <span v-if="u.propietario" class="rounded-full bg-acento px-2.5 py-0.5 text-xs font-semibold text-acento-texto">Propietario</span>
          <span v-if="!u.activo" class="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">Inactivo</span>
        </span>
      </div>
      <div v-if="u.cargo || u.cedula || u.ciudad || u.telefono || u.correo || u.direccion" class="grid gap-1 rounded-xl bg-brand-50/70 p-2.5 sm:grid-cols-2">
        <Dato v-if="u.cargo" :icono="Briefcase" etiqueta="Cargo">{{ u.cargo }}</Dato>
        <Dato v-if="u.cedula" :icono="IdCard" etiqueta="Cédula">{{ u.cedula }}</Dato>
        <Dato v-if="u.ciudad" :icono="MapPin" etiqueta="Ciudad">{{ u.ciudad }}</Dato>
        <Dato v-if="u.telefono" :icono="Phone" etiqueta="Teléfono">{{ u.telefono }}</Dato>
        <Dato v-if="u.correo" :icono="Mail" etiqueta="Correo" ajustar>{{ u.correo }}</Dato>
        <Dato v-if="u.direccion" :icono="MapPin" etiqueta="Dirección" ajustar>{{ u.direccion }}</Dato>
      </div>
      <div v-if="puedeCambiar(u)" class="flex items-center gap-2">
        <button class="btn-borde min-h-11 text-sm" @click="abrirEdicion(u)">
          <Pencil :size="16" aria-hidden="true" />
          Editar datos
        </button>
        <template v-if="u.id !== yo.id">
          <button class="btn-icono sm:ml-auto" :class="{ 'bg-brand-100': restableciendoId === u.id }" :aria-expanded="restableciendoId === u.id" :aria-label="`Restablecer la clave de ${u.nombre}`" title="Restablecer clave" @click="abrirRestablecer(u)">
            <KeyRound :size="18" aria-hidden="true" />
          </button>
          <button class="btn-icono" :class="{ '!border-emerald-600 !text-emerald-700': !u.activo }" :aria-label="`${u.activo ? 'Desactivar' : 'Activar'} a ${u.nombre}`" :title="u.activo ? 'Desactivar' : 'Activar'" @click="alternar(u)">
            <Power :size="18" aria-hidden="true" />
          </button>
          <button class="flex size-11 shrink-0 items-center justify-center rounded-xl text-red-700 active:bg-red-50" :aria-label="`Eliminar a ${u.nombre}`" title="Eliminar" @click="borrar(u)">
            <Trash2 :size="18" aria-hidden="true" />
          </button>
        </template>
      </div>

      <div v-if="restableciendoId === u.id" class="grid gap-2 rounded-xl bg-brand-50 p-3">
        <template v-if="u.cedula">
          <p class="text-sm text-brand-800">La clave volverá a ser su número de cédula (<b class="font-mono">{{ u.cedula }}</b>). Deberá cambiarla al ingresar y se cerrarán sus sesiones abiertas.</p>
          <p v-if="error" class="aviso-error">{{ error }}</p>
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
          <p v-if="aviso" class="aviso-error">{{ aviso }}</p>
          <div class="flex gap-2">
            <button type="button" class="btn-borde min-h-11" @click="restableciendoId = null">Cancelar</button>
            <button class="btn min-h-11" :disabled="cargando">Guardar</button>
          </div>
        </form>
      </div>
    </li>
  </ul>

  <Cargando v-if="cargando && !usuarios.length" />
  <Vacio v-else-if="!filtrados.length" :icono="Users" :texto="`No hay ${esSuper ? 'administradores' : 'usuarios'} que coincidan.`" />
  <BotonNuevo :texto="`Nuevo ${persona}`" @click="abrirAlta" />
  <Paginador :total="pag.total.value" :offset="pag.offset.value" :limite="pag.limite" @ir="pag.ir" />
</template>
