<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useAuth } from './composables/useAuth'
import { useInformes } from './composables/useInformes'
import { useVisitas } from './composables/useVisitas'
import { useTecnicos } from './composables/useTecnicos'
import { useFotos } from './composables/useFotos'
import { useNotificaciones } from './composables/useNotificaciones'
import { useConfiguracion } from './composables/useConfiguracion'
import { modoDemo, call, offline, iniciarSincronizacion } from './api'
import { haceDias, diaAnterior } from './utils'
import LoginView from './views/LoginView.vue'
import AgendaView from './views/AgendaView.vue'
import FormVisita from './views/FormVisita.vue'
import DetalleVisita from './views/DetalleVisita.vue'
import ListaInformes from './views/ListaInformes.vue'
import FormInforme from './views/FormInforme.vue'
import DetalleInforme from './views/DetalleInforme.vue'
import UsuariosView from './views/UsuariosView.vue'
import ClaveView from './views/ClaveView.vue'
import NotificacionesView from './views/NotificacionesView.vue'
import PendientesView from './views/PendientesView.vue'
import ClientesView from './views/ClientesView.vue'
import ConfiguracionView from './views/ConfiguracionView.vue'
import InstalarView from './views/InstalarView.vue'
import QrInstalarView from './views/QrInstalarView.vue'
import { useInstalacion } from './composables/useInstalacion'
import BarraConexion from './components/BarraConexion.vue'
import { ArrowLeft, Bell, Building2, CalendarDays, FileText, Menu, Plus, QrCode, Settings, ShieldCheck, Smartphone, UserRound } from 'lucide-vue-next'
import MenuLateral from './components/MenuLateral.vue'
import { estado as estadoRed } from './offline/estado'

const { usuario, esSuper, puedeAgendar, logueado, logout } = useAuth()
const I = useInformes()
const V = useVisitas()
const T = useTecnicos()
const F = useFotos()
const N = useNotificaciones()
const CFG = useConfiguracion()
const { instalada } = useInstalacion()
// Quien llega escaneando el QR (?instalar=1) ve primero cómo instalar la app
const verInstalacion = ref(new URLSearchParams(location.search).has('instalar') && !instalada.value)
function seguirDeInstalacion() {
  verInstalacion.value = false
  const u = new URL(location.href)
  u.searchParams.delete('instalar')
  history.replaceState(null, '', u.pathname + u.search + u.hash)
}
CFG.cargar() // marca de la empresa: pública, se pide también antes de iniciar sesión

// Vistas: agenda | visita-nueva | visita-detalle | visita-editar
//         informes | informe-nuevo | informe-detalle | informe-editar | usuarios
const vista = ref('agenda')
const seleccionadoId = ref(null)
const visitaOrigen = ref(null) // visita desde la que se crea un informe

const visita = computed(() => V.items.value.find((v) => v.id === seleccionadoId.value))
const informe = computed(() => I.items.value.find((i) => i.id === seleccionadoId.value))
const informesDeVisita = ref([]) // informes de la visita abierta (se piden al servidor al abrirla)
const prefill = computed(() => {
  const v = V.items.value.find((x) => x.id === visitaOrigen.value)
  if (!v) return undefined
  return { cliente: v.cliente, fecha: v.fecha, tipo: v.tipo, responsable: v.responsable, titulo: `${v.tipo} - ${v.cliente}`, visitaId: v.id }
})

const TITULOS = {
  agenda: 'Agenda de visitas',
  'visita-nueva': 'Nueva visita',
  'visita-detalle': 'Visita',
  'visita-editar': 'Editar visita',
  informes: 'Informes',
  'informe-nuevo': 'Nuevo informe',
  'informe-detalle': 'Informe',
  'informe-editar': 'Editar informe',
  usuarios: 'Usuarios',
  clave: 'Cambiar clave',
  notificaciones: 'Notificaciones',
  pendientes: 'Cambios pendientes',
  clientes: 'Clientes',
  ajustes: 'Ajustes de la app',
  instalar: 'Instalar la app',
  qr: 'Código QR de instalación',
}
const esPrincipal = computed(() => ['agenda', 'informes', 'clientes', 'usuarios', 'ajustes', 'instalar', 'qr'].includes(vista.value))
const error = computed(() => V.error.value || I.error.value)
const cargando = computed(() => V.cargando.value || I.cargando.value)

function ir(v, id = null) {
  vista.value = v
  seleccionadoId.value = id
  window.scrollTo(0, 0)
}

// Detalle de visita: muestra la visita ya cargada y pide al servidor sus informes (el listado general está paginado)
function cargarInformesDeVisita(id) {
  call('informes_list', { visitaId: id, limit: 50 })
    .then((r) => {
      if (seleccionadoId.value === id) informesDeVisita.value = r.items
    })
    .catch(() => {})
}

function abrirVisita(id) {
  ir('visita-detalle', id)
  informesDeVisita.value = []
  if (!V.items.value.some((v) => v.id === id)) V.obtener(id).catch(() => {})
  cargarInformesDeVisita(id)
}

// Detalle/edición de informe: el listado es liviano, así que se pide el registro completo (firma, checklist, observaciones)
function abrirInforme(v, id) {
  ir(v, id)
  I.obtener(id).catch(() => {})
}

// Nueva visita: en blanco (botón +) o con los datos de un cliente registrado (pantalla Clientes)
const prefillVisita = ref(null)

function nuevaVisita() {
  prefillVisita.value = null
  ir('visita-nueva')
}

function agendarParaCliente(c) {
  prefillVisita.value = { cliente: c.nombre, direccion: c.direccion, telefono: c.telefono }
  ir('visita-nueva')
}

// Tocar un aviso lleva a la visita o al informe al que se refiere
function abrirDesdeAviso(n) {
  const [tipo, id] = String(n.ref || '').split(':')
  if (tipo === 'visita' && id) abrirVisita(id)
  else if (tipo === 'informe' && id) abrirInforme('informe-detalle', id)
}

function volver() {
  const id = seleccionadoId.value
  switch (vista.value) {
    case 'visita-editar':
      return abrirVisita(id)
    case 'informe-editar':
      return abrirInforme('informe-detalle', id)
    case 'informe-nuevo':
      return visitaOrigen.value ? abrirVisita(visitaOrigen.value) : ir('informes')
    case 'informe-detalle':
      return ir('informes')
    default:
      return ir('agenda')
  }
}

// --- Visitas ---
async function guardarVisita(data) {
  try {
    if (vista.value === 'visita-editar') {
      await V.actualizar(seleccionadoId.value, data)
      abrirVisita(seleccionadoId.value)
    } else {
      const v = await V.crear(data)
      abrirVisita(v.id)
    }
  } catch {
    /* el error se muestra en el banner */
  }
}

// datos: { estado, motivo? }
const cambiarEstadoVisita = (datos) => V.actualizar(seleccionadoId.value, datos).catch(() => {})

async function borrarVisita() {
  if (!confirm('¿Eliminar esta visita? Sus fotos irán a la papelera de Drive. Sus informes no se borran.')) return
  try {
    await V.eliminar(seleccionadoId.value)
    ir('agenda')
  } catch {
    /* banner */
  }
}

function crearInformeDeVisita() {
  visitaOrigen.value = seleccionadoId.value
  ir('informe-nuevo', seleccionadoId.value)
}

// --- Informes ---
function nuevoInforme() {
  visitaOrigen.value = null
  ir('informe-nuevo')
}

async function guardarInforme(data) {
  try {
    if (vista.value === 'informe-editar') {
      await I.actualizar(seleccionadoId.value, data)
      abrirInforme('informe-detalle', seleccionadoId.value)
    } else {
      const item = await I.crear(data)
      visitaOrigen.value = null
      abrirInforme('informe-detalle', item.id)
    }
  } catch {
    /* banner */
  }
}

async function borrarInforme() {
  if (!confirm('¿Eliminar este informe?')) return
  try {
    await I.eliminar(seleccionadoId.value)
    ir('informes')
  } catch {
    /* banner */
  }
}

// Agenda: se carga una ventana (últimos 14 días y todo lo futuro); las anteriores se piden con "Cargar visitas anteriores"
const VENTANA_DIAS = 14
const hayAnteriores = ref(false)
const cargandoAnteriores = ref(false)
let desdeVentana = ''
let anterioresCargadas = 0

async function cargarVisitas() {
  desdeVentana = haceDias(VENTANA_DIAS)
  anterioresCargadas = 0
  await V.cargar({ desde: desdeVentana })
  hayAnteriores.value = V.meta.value.antes > 0
}

async function cargarAnteriores() {
  cargandoAnteriores.value = true
  try {
    const r = await V.agregar({ hasta: diaAnterior(desdeVentana), orden: 'desc', limit: 30, offset: anterioresCargadas })
    anterioresCargadas += r.items.length
    hayAnteriores.value = r.hasMore
  } catch {
    /* el error se muestra en el banner */
  } finally {
    cargandoAnteriores.value = false
  }
}

const recargar = () => Promise.allSettled([cargarVisitas(), I.recargar(), T.cargar()])

// Tras volver la conexión o enviar cambios en cola: recarga los datos y refresca la pantalla abierta
const claveRefresco = ref(0) // cambiarla vuelve a montar el detalle de la visita (recarga sus fotos)
const mensajeSync = ref('')
let temporizadorMensaje = null

async function refrescarTodo() {
  F.limpiar()
  claveRefresco.value++
  await recargar()
  if (vista.value === 'informe-detalle' || vista.value === 'informe-editar') I.obtener(seleccionadoId.value).catch(() => {})
  if (vista.value === 'visita-detalle') cargarInformesDeVisita(seleccionadoId.value)
}

if (offline) {
  offline.ganchos.alSincronizar = (n) => {
    mensajeSync.value = n === 1 ? 'Se envió 1 cambio.' : `Se enviaron ${n} cambios.`
    clearTimeout(temporizadorMensaje)
    temporizadorMensaje = setTimeout(() => (mensajeSync.value = ''), 4000)
    refrescarTodo()
  }
}

let detenerConexion = () => {}

// Al iniciar sesión se carga todo; al cerrarla se limpia
watch(
  () => logueado.value && !usuario.value?.cambiarClave, // con clave temporal el backend no entrega datos: se carga tras cambiarla
  (si) => {
    if (si) {
      ir('agenda')
      recargar()
      N.iniciar()
      CFG.cargar()
      detenerConexion = iniciarSincronizacion({ alRecuperar: refrescarTodo })
    } else {
      N.detener()
      detenerConexion()
      detenerConexion = () => {}
      V.limpiar()
      I.limpiar()
      T.limpiar()
      F.limpiar()
    }
  },
  { immediate: true },
)

// ---------- Menú lateral (botón hamburguesa) ----------
// Árbol de botones y subbotones en cascada. Un grupo con un solo subbotón se muestra directamente como botón.
const menuAbierto = ref(false)
const abiertos = reactive(new Set()) // grupos desplegados
const opcionActiva = ref(null) // subbotón que abre una sección concreta (p. ej. "Nuevo cliente" o una sección de Ajustes)
const solicitudClientes = ref(null)
const solicitudAjustes = ref(null)

const arbol = computed(() => {
  const v = vista.value
  const op = opcionActiva.value
  const hoja = (id, texto, vistas, extra = {}) => ({ id, texto, vistas, activo: vistas.includes(v) && (extra.opcion ?? null) === op, ...extra })
  const grupo = (id, texto, icono, hijos, extra = {}) => {
    const lista = hijos.filter(Boolean)
    if (!lista.length) return null // p. ej. un técnico con la app ya instalada
    if (lista.length === 1) return { ...lista[0], texto, icono, ...extra }
    return { id, texto, icono, hijos: lista, activo: lista.some((h) => h.activo), ...extra }
  }
  const sinLeer = N.noLeidas.value || null
  const sinEnviar = estadoRed.pendientes + estadoRed.fallidas

  return [
    grupo('visitas', puedeAgendar.value ? 'Visitas' : 'Mis visitas', CalendarDays, [
      hoja('agenda', 'Agenda', ['agenda', 'visita-detalle', 'visita-editar']),
      puedeAgendar.value && hoja('visita-nueva', 'Nueva visita', ['visita-nueva']),
    ]),
    grupo('informes', 'Informes', FileText, [
      hoja('informes', 'Lista de informes', ['informes', 'informe-detalle', 'informe-editar']),
      hoja('informe-nuevo', 'Nuevo informe', ['informe-nuevo']),
    ]),
    puedeAgendar.value &&
      grupo('clientes', 'Clientes', Building2, [
        hoja('clientes', 'Lista de clientes', ['clientes']),
        hoja('cliente-nuevo', 'Nuevo cliente', ['clientes'], { opcion: 'nuevo' }),
      ]),
    esSuper.value &&
      grupo('administracion', 'Administración', ShieldCheck, [
        hoja('usuarios', 'Usuarios', ['usuarios']),
        grupo(
          'ajustes',
          'Ajustes de la app',
          Settings,
          [['empresa', 'Datos de la empresa'], ['tema', 'Colores y logo'], ['informes', 'Informes'], ['tipos', 'Tipos de visita y checklists']].map(([seccion, texto]) =>
            hoja(`ajustes-${seccion}`, texto, ['ajustes'], { opcion: seccion }),
          ),
        ),
      ]),
    grupo('instalacion', 'Instalar la app', Smartphone, [
      puedeAgendar.value && hoja('qr', 'Código QR para instalar', ['qr']),
      !instalada.value && hoja('instalar', 'Instalar en este equipo', ['instalar']),
    ], puedeAgendar.value ? {} : { icono: Smartphone }),
    grupo(
      'cuenta',
      'Mi cuenta',
      UserRound,
      [
        hoja('notificaciones', 'Notificaciones', ['notificaciones'], { insignia: sinLeer }),
        sinEnviar ? hoja('pendientes', 'Cambios pendientes', ['pendientes'], { insignia: sinEnviar }) : null,
        hoja('clave', 'Cambiar mi clave', ['clave']),
      ],
      { insignia: sinLeer },
    ),
  ].filter(Boolean)
})

// Despliega la rama de la sección en la que se está, para que el menú abra "donde estás"
function desplegarActivos(nodos) {
  for (const n of nodos) {
    if (!n.hijos) continue
    desplegarActivos(n.hijos)
    if (n.activo) abiertos.add(n.id)
  }
}

function abrirMenu() {
  abiertos.clear()
  desplegarActivos(arbol.value)
  menuAbierto.value = true
}

const alternarGrupo = (id) => (abiertos.has(id) ? abiertos.delete(id) : abiertos.add(id))

function elegir(n) {
  menuAbierto.value = false
  opcionActiva.value = n.opcion ?? null
  if (n.id === 'visita-nueva') return nuevaVisita()
  if (n.id === 'informe-nuevo') return nuevoInforme()
  if (n.id === 'cliente-nuevo') solicitudClientes.value = { tipo: 'nuevo', n: Date.now() }
  if (n.id.startsWith('ajustes-')) solicitudAjustes.value = { seccion: n.opcion, n: Date.now() }
  ir(n.vistas[0])
}

function salirDelMenu() {
  menuAbierto.value = false
  logout()
}
</script>

<template>
  <InstalarView v-if="verInstalacion" completa @continuar="seguirDeInstalacion" />
  <LoginView v-else-if="!logueado" />
  <ClaveView v-else-if="usuario.cambiarClave" obligatorio />

  <template v-else>
    <header class="sticky top-0 z-10 print:hidden bg-brand-800 pt-[env(safe-area-inset-top)] text-white shadow">
      <div class="mx-auto flex max-w-3xl items-center gap-0.5 px-2 py-1">
        <button class="flex size-10 shrink-0 items-center justify-center rounded-full active:bg-white/10" aria-label="Abrir menú" aria-haspopup="dialog" :aria-expanded="menuAbierto" aria-controls="menu-lateral" @click="abrirMenu">
          <Menu :size="22" aria-hidden="true" />
        </button>
        <button v-if="!esPrincipal" class="flex size-10 shrink-0 items-center justify-center rounded-full active:bg-white/10" aria-label="Volver" @click="volver">
          <ArrowLeft :size="20" aria-hidden="true" />
        </button>
        <h1 class="flex-1 truncate px-2 text-base font-semibold">{{ vista === 'agenda' && !puedeAgendar ? 'Mis visitas' : TITULOS[vista] }}</h1>
        <button class="relative flex size-10 shrink-0 items-center justify-center rounded-full text-brand-100 active:bg-white/10" aria-label="Notificaciones" @click="ir('notificaciones')">
          <Bell :size="20" aria-hidden="true" />
          <span v-if="N.noLeidas.value" class="absolute top-1 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-acento px-1 text-[10px] leading-4 font-bold text-acento-texto">{{ N.noLeidas.value > 9 ? '9+' : N.noLeidas.value }}</span>
        </button>
      </div>
    </header>

    <MenuLateral :abierto="menuAbierto" :arbol="arbol" :abiertos="abiertos" :usuario="usuario" @cerrar="menuAbierto = false" @elegir="elegir" @alternar="alternarGrupo" @salir="salirDelMenu" />

    <BarraConexion @ver="ir('pendientes')" />
    <p v-if="mensajeSync" class="print:hidden bg-emerald-100 px-4 py-1.5 text-center text-sm text-emerald-800" role="status">{{ mensajeSync }}</p>
    <p v-if="modoDemo" class="print:hidden bg-acento/90 px-4 py-1.5 text-xs text-acento-texto">Modo demo: datos solo en este dispositivo. Configura <code>VITE_SCRIPT_URL</code> para usar Google Sheets.</p>
    <p v-if="error && vista !== 'usuarios'" class="print:hidden bg-red-100 px-4 py-2 text-sm text-red-800">{{ error }}</p>

    <main class="mx-auto max-w-3xl px-4 pt-3 pb-24 print:max-w-none print:p-0">
      <!-- Agenda -->
      <AgendaView v-if="vista === 'agenda'" :visitas="V.items.value" :cargando="cargando" :mostrar-autor="esSuper" :nombre-de="T.nombreDe" :hay-anteriores="hayAnteriores" :cargando-mas="cargandoAnteriores" @abrir="(id) => abrirVisita(id)" @refrescar="recargar" @anteriores="cargarAnteriores" />
      <FormVisita v-else-if="vista === 'visita-nueva' && puedeAgendar" :tecnicos="T.tecnicos.value" :prefill="prefillVisita" :cargando="cargando" @guardar="guardarVisita" @cancelar="ir('agenda')" />
      <FormVisita v-else-if="vista === 'visita-editar' && visita && puedeAgendar" :tecnicos="T.tecnicos.value" :inicial="visita" :cargando="cargando" @guardar="guardarVisita" @cancelar="abrirVisita(seleccionadoId)" />
      <DetalleVisita
        v-else-if="vista === 'visita-detalle' && visita"
        :key="claveRefresco"
        :visita="visita"
        :informes="informesDeVisita"
        :puede-gestionar="puedeAgendar"
        :nombre-de="T.nombreDe"
        @editar="ir('visita-editar', seleccionadoId)"
        @eliminar="borrarVisita"
        @estado="cambiarEstadoVisita"
        @crear-informe="crearInformeDeVisita"
        @abrir-informe="(id) => abrirInforme('informe-detalle', id)"
      />

      <!-- Informes -->
      <ListaInformes
        v-else-if="vista === 'informes'"
        :informes="I.items.value"
        :cargando="I.cargando.value"
        :mostrar-autor="esSuper"
        :hay-mas="I.hayMas.value"
        :total="I.meta.value.total"
        :filtros="I.parametros.value"
        @abrir="(id) => abrirInforme('informe-detalle', id)"
        @refrescar="recargar"
        @buscar="(p) => I.cargar(p).catch(() => {})"
        @mas="I.masPaginas().catch(() => {})"
      />
      <FormInforme v-else-if="vista === 'informe-nuevo'" :prefill="prefill" :cargando="cargando" @guardar="guardarInforme" @cancelar="volver" />
      <FormInforme v-else-if="vista === 'informe-editar' && informe?._completo" :inicial="informe" :cargando="cargando" @guardar="guardarInforme" @cancelar="abrirInforme('informe-detalle', seleccionadoId)" />
      <DetalleInforme v-else-if="vista === 'informe-detalle' && informe?._completo" :informe="informe" @editar="abrirInforme('informe-editar', seleccionadoId)" @eliminar="borrarInforme" />

      <p v-else-if="vista === 'informe-detalle' || vista === 'informe-editar'" class="py-10 text-center text-brand-700">Cargando informe…</p>
      <NotificacionesView v-else-if="vista === 'notificaciones'" @abrir="abrirDesdeAviso" />
      <PendientesView v-else-if="vista === 'pendientes'" />
      <ClientesView v-else-if="vista === 'clientes' && puedeAgendar" :solicitud="solicitudClientes" @agendar="agendarParaCliente" @abrir-visita="abrirVisita" />
      <ConfiguracionView v-else-if="vista === 'ajustes' && esSuper" :solicitud="solicitudAjustes" />
      <InstalarView v-else-if="vista === 'instalar'" @continuar="ir('agenda')" />
      <QrInstalarView v-else-if="vista === 'qr' && puedeAgendar" />
      <ClaveView v-else-if="vista === 'clave'" @listo="ir('agenda')" />
      <UsuariosView v-else-if="vista === 'usuarios' && esSuper" />
    </main>

    <template v-if="esPrincipal">
      <button
        v-if="(vista === 'agenda' && puedeAgendar) || vista === 'informes'"
        class="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 flex size-12 items-center justify-center rounded-full bg-acento text-acento-texto shadow-md active:bg-acento-600 print:hidden"
        :aria-label="vista === 'agenda' ? 'Nueva visita' : 'Nuevo informe'"
        @click="vista === 'agenda' ? nuevaVisita() : nuevoInforme()"
      >
        <Plus :size="24" aria-hidden="true" />
      </button>

    </template>
  </template>
</template>
