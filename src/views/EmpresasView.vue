<script setup>
import BotonNuevo from '../components/BotonNuevo.vue'
import Cargando from '../components/Cargando.vue'
import Vacio from '../components/Vacio.vue'
import PieFormulario from '../components/PieFormulario.vue'
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { Building2, IdCard, KeyRound, Mail, Phone, Power, Users } from 'lucide-vue-next'
import { call } from '../api'
import { useToast } from '../composables/useToast'
import { confirmar } from '../composables/useConfirmar'
import { normalizar, motivoCedulaInvalida, correoValido, telefonoValido } from '../utils'
import CredencialesNuevas from '../components/CredencialesNuevas.vue'
import BarraFiltros from '../components/BarraFiltros.vue'
import Paginador from '../components/Paginador.vue'
import Modal from '../components/Modal.vue'
import Avatar from '../components/Avatar.vue'
import Dato from '../components/Dato.vue'
import { useSinGuardar } from '../composables/useSinGuardar'
import { usePaginaLocal } from '../composables/usePaginaLocal'

// Empresas del sistema. Solo las ve y administra el root: las crea con su superadministrador, las habilita o deshabilita y
// restablece la clave de ese superadministrador, que es el único que personaliza cada empresa.
const toast = useToast()
const empresas = ref([])
const cargando = ref(false)
const guardando = ref(false)
const error = ref('')

const PLANES = ['prueba', 'basico', 'pro']
const duenoVacio = () => ({ ciudad: '', cedula: '', correo: '', telefono: '' })
const vacia = () => ({ nombre: '', ...duenoVacio() })
const form = reactive(vacia())
const credenciales = ref(null) // { nombre, usuario, clave } del superadministrador recién creado

// Mensaje del primer dato inválido del dueño, o ''
const validarDueno = (d) =>
  motivoCedulaInvalida(d.cedula) ||
  (!correoValido(d.correo) && 'El correo no es válido') ||
  (!telefonoValido(d.telefono) && 'El teléfono no es válido (de 7 a 15 dígitos)') ||
  (!d.ciudad.trim() && 'Escribe la ciudad') ||
  ''

const creando = ref(false)
const salirDeAlta = useSinGuardar(() => creando.value && !credenciales.value && JSON.stringify(form) !== JSON.stringify(vacia()))

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    empresas.value = await call('empresas_list')
  } catch (e) {
    error.value = e.message
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

// Búsqueda y filtros (estado y plan) en el dispositivo; la lista llega completa y se muestra por páginas
const q = ref('')
const estado = ref('')
const plan = ref('')
const filtradas = computed(() => {
  const t = normalizar(q.value)
  return empresas.value.filter(
    (e) =>
      (!estado.value || (estado.value === 'activas') === e.activa) &&
      (!plan.value || e.plan === plan.value) &&
      (!t || [e.nombre, e.datos?.ruc, e.datos?.correo, e.datos?.telefono].some((c) => normalizar(c).includes(t))),
  )
})
const pag = usePaginaLocal(filtradas, 10)
watch([q, estado, plan], pag.volverAlInicio)

function abrir() {
  Object.assign(form, vacia())
  creando.value = true
  credenciales.value = null
  error.value = ''
}
const cerrar = async () => {
  if (!(await salirDeAlta())) return
  creando.value = false
  credenciales.value = null
}

async function guardar() {
  error.value = validarDueno(form)
  if (error.value) return
  guardando.value = true
  try {
    const r = await call('empresas_create', { data: { ...form } })
    credenciales.value = { nombre: form.nombre, usuario: r.usuario, clave: r.clave } // el modal queda abierto para entregarlos
    toast.exito(`Empresa "${form.nombre}" creada.`)
    await cargar()
  } catch (e) {
    error.value = e.message
  } finally {
    guardando.value = false
  }
}

// ---------- Superadministrador de una empresa ----------
// Las claves se guardan cifradas: se muestra la temporal mientras no la hayan cambiado; si la olvidan, se restablece.
const adminsDe = ref(null) // empresa abierta
const admins = ref([])
const cargandoAdmins = ref(false)
const errorAdmins = ref('')
const nuevoDueno = reactive(duenoVacio()) // para una empresa que se quedó sin superadministrador
const claveEntregar = ref(null) // { accion, nombre, usuario, clave }
const salirDeAdmins = useSinGuardar(() => !!adminsDe.value && !admins.value.length && Object.values(nuevoDueno).some(Boolean))
const cerrarAdmins = async () => (await salirDeAdmins()) && (adminsDe.value = null)

async function abrirAdmins(e) {
  adminsDe.value = e
  admins.value = []
  errorAdmins.value = ''
  Object.assign(nuevoDueno, duenoVacio())
  cargandoAdmins.value = true
  try {
    admins.value = await call('empresas_admins', { id: e.id })
  } catch (err) {
    errorAdmins.value = err.message
  } finally {
    cargandoAdmins.value = false
  }
}

async function crearAdmin() {
  errorAdmins.value = validarDueno(nuevoDueno)
  if (errorAdmins.value) return
  const empresa = adminsDe.value
  try {
    const r = await call('empresas_create_admin', { id: empresa.id, data: { ...nuevoDueno } })
    claveEntregar.value = { accion: 'Superadministrador creado', nombre: empresa.nombre, usuario: r.usuario, clave: r.clave }
    adminsDe.value = null
    await cargar()
  } catch (err) {
    errorAdmins.value = err.message
  }
}

async function restablecerAdmin(a) {
  errorAdmins.value = ''
  const quien = `${a.nombre} (@${a.usuario})`
  if (!(await confirmar({ titulo: '¿Restablecer la clave?', texto: `Se cerrarán las sesiones de ${quien}. Su clave temporal será tu cédula y deberá crear una nueva al ingresar.`, confirmar: 'Restablecer', peligro: true }))) return
  try {
    const r = await call('empresas_restablecer_admin', { id: a.id })
    claveEntregar.value = { accion: 'Clave restablecida', nombre: a.nombre, usuario: r.usuario, clave: r.clave }
    adminsDe.value = null
  } catch (err) {
    errorAdmins.value = err.message
  }
}

async function alternar(e) {
  const ok = await confirmar(
    e.activa
      ? { titulo: `¿Desactivar "${e.nombre}"?`, texto: 'Todos sus usuarios dejarán de poder entrar hasta que la actives de nuevo. Sus datos no se borran.', confirmar: 'Desactivar', peligro: true }
      : { titulo: `¿Activar "${e.nombre}"?`, texto: 'Sus usuarios podrán volver a entrar.', confirmar: 'Activar' },
  )
  if (!ok) return
  try {
    await call('empresas_update', { id: e.id, data: { activa: !e.activa } })
    toast.exito(e.activa ? `"${e.nombre}" desactivada: sus usuarios ya no pueden entrar.` : `"${e.nombre}" activada.`)
    await cargar()
  } catch (err) {
    toast.error(err.message)
  }
}
</script>

<template>
  <BarraFiltros v-model="q" placeholder="Buscar empresa" :activos="(estado ? 1 : 0) + (plan ? 1 : 0)">
    <template #filtros>
      <select v-model="estado" class="campo !min-h-10 !py-1.5 text-sm" aria-label="Filtrar por estado">
        <option value="">Activas y desactivadas</option>
        <option value="activas">Solo activas</option>
        <option value="desactivadas">Solo desactivadas</option>
      </select>
      <select v-model="plan" class="campo !min-h-10 !py-1.5 text-sm" aria-label="Filtrar por plan">
        <option value="">Todos los planes</option>
        <option v-for="p in PLANES" :key="p" :value="p">{{ p }}</option>
      </select>
    </template>
  </BarraFiltros>

  <p v-if="error && !creando" class="aviso-error mb-3">{{ error }}</p>

  <Modal v-if="creando" :titulo="credenciales ? 'Empresa creada' : 'Nueva empresa'" @cerrar="cerrar">
    <CredencialesNuevas v-if="credenciales" v-bind="credenciales" de-root @listo="cerrar" />
    <form v-else @submit.prevent="guardar">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label class="etiqueta">Nombre de la empresa
        <input v-model.trim="form.nombre" class="campo" required maxlength="60" />
      </label>
      <label class="etiqueta">Ciudad
        <input v-model.trim="form.ciudad" class="campo" required />
      </label>
      <label class="etiqueta">Cédula
        <input v-model.trim="form.cedula" class="campo" inputmode="numeric" maxlength="10" required />
      </label>
      <label class="etiqueta">Correo
        <input v-model.trim="form.correo" class="campo" type="email" autocapitalize="none" required />
      </label>
      <label class="etiqueta">Teléfono
        <input v-model.trim="form.telefono" class="campo" type="tel" required />
      </label>
      </div>
      <p class="text-xs text-brand-700/80">Se crea su superadministrador: el usuario sale del nombre de la empresa y la clave temporal es tu cédula. Él personaliza la empresa y crea al administrador.</p>
      <PieFormulario texto="Crear empresa" :cargando="guardando" :error="error" @cancelar="cerrar" />
    </form>
  </Modal>

  <!-- Superadministrador de la empresa -->
  <Modal v-if="adminsDe" :titulo="`Superadministrador de ${adminsDe.nombre}`" @cerrar="cerrarAdmins">
    <p v-if="cargandoAdmins" class="py-4 text-center text-brand-700">Cargando…</p>
    <form v-else-if="!admins.length" class="grid gap-3" @submit.prevent="crearAdmin">
      <p class="text-sm text-brand-800">Esta empresa no tiene superadministrador.</p>
      <label class="etiqueta">Ciudad
        <input v-model.trim="nuevoDueno.ciudad" class="campo" required />
      </label>
      <label class="etiqueta">Cédula
        <input v-model.trim="nuevoDueno.cedula" class="campo" inputmode="numeric" maxlength="10" required />
      </label>
      <label class="etiqueta">Correo
        <input v-model.trim="nuevoDueno.correo" class="campo" type="email" autocapitalize="none" required />
      </label>
      <label class="etiqueta">Teléfono
        <input v-model.trim="nuevoDueno.telefono" class="campo" type="tel" required />
      </label>
      <button class="btn min-h-11">Crear superadministrador</button>
    </form>
    <ul v-else class="grid gap-3">
      <li v-for="a in admins" :key="a.id" class="grid gap-2 rounded-xl bg-brand-50 p-3" :class="{ 'opacity-60': !a.activo }">
        <div>
          <b class="text-brand-900">{{ a.nombre }}</b>
          <p class="text-sm text-brand-700">Usuario: <b class="font-mono">{{ a.usuario }}</b><template v-if="!a.activo"> · inactivo</template></p>
          <p v-if="a.claveTemporal" class="text-sm text-brand-700">Clave temporal: <b class="font-mono">{{ a.claveTemporal }}</b></p>
          <p v-else class="text-sm text-brand-700">Ya cambió su clave (se guarda cifrada y no se puede ver).</p>
          <p v-if="a.correo" class="text-xs break-all text-brand-700/70">{{ a.correo }}</p>
        </div>
        <button v-if="!a.claveTemporal" class="btn min-h-11" @click="restablecerAdmin(a)"><KeyRound :size="18" aria-hidden="true" />Restablecer clave</button>
      </li>
    </ul>
    <p v-if="errorAdmins" class="aviso-error mt-3">{{ errorAdmins }}</p>
  </Modal>
  <Modal v-if="claveEntregar" :titulo="claveEntregar.accion" @cerrar="claveEntregar = null">
    <CredencialesNuevas v-bind="claveEntregar" de-root @listo="claveEntregar = null" />
  </Modal>

  <Cargando v-if="cargando && !empresas.length" />
  <Vacio v-else-if="!empresas.length" :icono="Building2" texto="Todavía no hay empresas." />
  <Vacio v-else-if="!filtradas.length" :icono="Building2" texto="No hay empresas que coincidan." />

  <ul class="grid gap-2.5 lg:grid-cols-[repeat(auto-fit,minmax(24rem,1fr))]">
    <li v-for="e in pag.visibles.value" :key="e.id" class="tarjeta grid gap-3 border-l-4" :class="e.activa ? 'border-l-emerald-500' : 'border-l-red-400 opacity-80'">
      <div class="flex items-start gap-3">
        <Avatar :icono="Building2" :inactivo="!e.activa" />
        <div class="grid min-w-0 flex-1 gap-1">
          <strong class="text-base leading-snug wrap-anywhere text-brand-900">{{ e.nombre }}</strong>
          <span class="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <span class="rounded-full px-2.5 py-0.5" :class="e.activa ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'">{{ e.activa ? 'Activa' : 'Desactivada' }}</span>
            <span class="rounded-full bg-brand-100 px-2.5 py-0.5 text-brand-800">Plan {{ e.plan }}</span>
            <span class="flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-brand-800"><Users :size="12" aria-hidden="true" />{{ e.usuarios }} {{ e.usuarios === 1 ? 'usuario' : 'usuarios' }}</span>
          </span>
        </div>
      </div>
      <div v-if="e.datos?.ruc || e.datos?.telefono || e.datos?.correo" class="grid gap-1 rounded-xl bg-brand-50/70 p-2.5 sm:grid-cols-2">
        <Dato v-if="e.datos?.ruc" :icono="IdCard" etiqueta="RUC">{{ e.datos.ruc }}</Dato>
        <Dato v-if="e.datos?.telefono" :icono="Phone" etiqueta="Teléfono">{{ e.datos.telefono }}</Dato>
        <Dato v-if="e.datos?.correo" :icono="Mail" etiqueta="Correo" ajustar>{{ e.datos.correo }}</Dato>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-borde min-h-11 text-sm" @click="abrirAdmins(e)"><KeyRound :size="16" aria-hidden="true" />Superadministrador</button>
        <button class="btn-icono sm:ml-auto" :class="{ '!border-emerald-600 !text-emerald-700': !e.activa }" :aria-label="`${e.activa ? 'Desactivar' : 'Activar'} ${e.nombre}`" :title="e.activa ? 'Desactivar' : 'Activar'" @click="alternar(e)">
          <Power :size="18" aria-hidden="true" />
        </button>
      </div>
    </li>
  </ul>

  <BotonNuevo texto="Nueva empresa" @click="abrir" />
  <Paginador :total="pag.total.value" :offset="pag.offset.value" :limite="pag.limite" @ir="pag.ir" />
</template>
