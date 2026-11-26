<script setup>
import { ref, computed, onMounted } from 'vue'
import { CalendarPlus, CalendarDays, FilePlus2, Building2, TriangleAlert, RefreshCw, Wrench, Settings, ShieldCheck } from 'lucide-vue-next'
import { call } from '../api'
import { useAuth } from '../composables/useAuth'
import { useConfiguracion } from '../composables/useConfiguracion'
import EstadoBadge from '../components/EstadoBadge.vue'
import Dato from '../components/Dato.vue'
import { bordeDeEstado } from '../estados'
import GraficoBarras from '../components/GraficoBarras.vue'
import { fechaLarga, hoy, manana } from '../utils'

// Inicio de la app: cifras de lo que importa hoy según el rol (el técnico solo ve lo suyo; la plataforma ve además sus empresas),
// un gráfico de las visitas de la semana, las próximas visitas y los últimos informes. Cada cifra lleva a su lista filtrada.
const emit = defineEmits(['agenda', 'informes', 'ir', 'visita', 'informe', 'nuevaVisita', 'nuevoInforme'])
const { usuario, puedeAgendar, esSuper, esPlataforma, esRoot, sinOperacion } = useAuth()
const { empresa } = useConfiguracion()

const datos = ref(null)
const cargando = ref(false)
const error = ref('')

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    datos.value = await call('dashboard_resumen')
  } catch (e) {
    error.value = e.message
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

const nombre = computed(() => String(usuario.value?.nombre || '').split(/\s+/)[0] || '')
const saludo = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
})

// Cifras por rol. `ir` = a dónde lleva al tocarla (null = informativa)
const tiles = computed(() => {
  const d = datos.value
  if (!d) return []
  if (!puedeAgendar.value) {
    return [
      { id: 'hoy', texto: 'Mis visitas de hoy', valor: d.visitasHoy, ir: () => emit('agenda', 'hoy') },
      { id: 'aceptar', texto: 'Por aceptar', valor: d.porAceptar, ir: () => emit('agenda', 'proximas'), alerta: d.porAceptar > 0 },
      { id: 'curso', texto: 'En curso', valor: d.enCurso },
      { id: 'mes', texto: 'Realizadas este mes', valor: d.realizadasMes },
      { id: 'borr', texto: 'Mis informes en borrador', valor: d.informesBorrador, ir: () => emit('informes', 'Borrador') },
      { id: 'fin', texto: 'Finalizados este mes', valor: d.informesFinalizadosMes, ir: () => emit('informes', 'Finalizado') },
    ]
  }
  return [
    { id: 'hoy', texto: 'Visitas de hoy', valor: d.visitasHoy, ir: () => emit('agenda', 'hoy') },
    { id: 'prox', texto: 'Próximas', valor: d.proximas, ir: () => emit('agenda', 'proximas') },
    { id: 'curso', texto: 'En curso', valor: d.enCurso },
    { id: 'mes', texto: 'Realizadas este mes', valor: d.realizadasMes },
    { id: 'borr', texto: 'Informes en borrador', valor: d.informesBorrador, ir: () => emit('informes', 'Borrador') },
    { id: 'fin', texto: 'Finalizados este mes', valor: d.informesFinalizadosMes, ir: () => emit('informes', 'Finalizado') },
    { id: 'cli', texto: 'Clientes', valor: d.clientes, ir: () => emit('ir', 'clientes') },
    { id: 'tec', texto: 'Técnicos activos', valor: d.tecnicos, ir: () => emit('ir', 'usuarios') },
  ]
})

// Gráfico: 7 días atrás y 7 por delante; hoy destacado
const barras = computed(() =>
  (datos.value?.porDia || []).map((x) => {
    const f = new Date(`${x.fecha}T00:00:00`)
    return {
      etiqueta: String(f.getDate()),
      sub: f.toLocaleDateString('es', { weekday: 'short' }).replace('.', '').slice(0, 1).toUpperCase(),
      valor: x.total,
      detalle: f.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''),
      destacado: x.fecha === datos.value.hoy,
    }
  }),
)
const totalSemana = computed(() => barras.value.reduce((s, b) => s + b.valor, 0))

// Día corto para las listas: Hoy, Mañana o "21 nov"
const etiquetaDia = (f) => (f === hoy() ? 'Hoy' : f === manana() ? 'Mañana' : new Date(`${f}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', ''))
const pl = computed(() => datos.value?.plataforma)
</script>

<template>
  <section class="grid gap-4">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="truncate text-xl font-bold text-brand-900">{{ saludo }}<template v-if="nombre">, {{ nombre }}</template></h2>
        <p class="text-sm text-brand-700 first-letter:uppercase">{{ fechaLarga(hoy()) }}<template v-if="!esRoot"> · {{ empresa.nombre }}</template></p>
      </div>
      <button class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-200 bg-white text-brand-700" aria-label="Actualizar" :disabled="cargando" @click="cargar">
        <RefreshCw :size="18" :class="{ 'animate-spin': cargando }" aria-hidden="true" />
      </button>
    </header>

    <!-- Accesos rápidos -->
    <div v-if="!sinOperacion" class="flex flex-wrap gap-2">
      <button v-if="puedeAgendar" class="btn min-h-10 flex-none text-sm" @click="$emit('nuevaVisita')"><CalendarPlus :size="16" aria-hidden="true" />Nueva visita</button>
      <button class="btn-borde min-h-10 flex-none text-sm" @click="$emit('nuevoInforme')"><FilePlus2 :size="16" aria-hidden="true" />Nuevo informe</button>
      <button class="btn-borde min-h-10 flex-none text-sm" @click="$emit('agenda', 'proximas')"><CalendarDays :size="16" aria-hidden="true" />Agenda</button>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-else-if="!datos" class="py-10 text-center text-brand-700">Cargando…</p>

    <template v-else>
      <template v-if="!sinOperacion">
      <!-- Aviso de visitas atrasadas -->
      <button v-if="datos.atrasadas" class="flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2.5 text-left text-sm font-medium text-amber-900" @click="$emit('agenda', 'pasadas')">
        <TriangleAlert :size="18" class="shrink-0" aria-hidden="true" />
        {{ datos.atrasadas }} {{ datos.atrasadas === 1 ? 'visita atrasada' : 'visitas atrasadas' }}: la fecha ya pasó y siguen sin cerrarse. Revisar.
      </button>

      <!-- Cifras -->
      <ul class="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
        <li v-for="t in tiles" :key="t.id">
          <component :is="t.ir ? 'button' : 'div'" class="tarjeta grid h-full w-full gap-0.5 text-left" :class="t.ir ? 'active:bg-brand-50' : ''" @click="t.ir && t.ir()">
            <span class="text-xs text-brand-700">{{ t.texto }}</span>
            <span class="text-2xl leading-tight font-bold" :class="t.alerta ? 'text-amber-700' : 'text-brand-900'">{{ t.valor }}</span>
          </component>
        </li>
      </ul>

      <!-- Gráfico -->
      <div class="tarjeta grid gap-1">
        <div class="flex items-baseline justify-between gap-2">
          <h3 class="font-semibold text-brand-800">Visitas por día</h3>
          <p class="text-xs text-brand-700/70">7 días atrás y 7 por delante · {{ totalSemana }} en total</p>
        </div>
        <GraficoBarras :datos="barras" unidad="visitas" />
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <!-- Próximas visitas -->
        <div class="tarjeta grid content-start gap-2">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-brand-800">{{ puedeAgendar ? 'Próximas visitas' : 'Mis próximas visitas' }}</h3>
            <button class="text-xs font-semibold text-brand-700 underline" @click="$emit('agenda', 'proximas')">Ver agenda</button>
          </div>
          <p v-if="!datos.proximasLista.length" class="py-3 text-sm text-brand-700/70">No hay visitas pendientes.</p>
          <ul v-else class="grid gap-2">
            <li v-for="v in datos.proximasLista" :key="v.id">
              <button class="flex w-full items-center gap-3 rounded-xl border-l-4 bg-brand-50/70 px-3 py-2 text-left active:bg-brand-100" :class="bordeDeEstado(v.estado)" @click="$emit('visita', v.id)">
                <span class="w-14 shrink-0 text-xs leading-tight text-brand-700"><b class="block text-base text-brand-900">{{ v.hora.slice(0, 5) }}</b>{{ etiquetaDia(v.fecha) }}</span>
                <span class="grid min-w-0 flex-1 gap-0.5"><b class="truncate text-sm text-brand-900">{{ v.cliente }}</b><Dato :icono="Wrench" etiqueta="Tipo">{{ v.tipo }}</Dato></span>
                <EstadoBadge :estado="v.estado" />
              </button>
            </li>
          </ul>
        </div>

        <!-- Últimos informes -->
        <div class="tarjeta grid content-start gap-2">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-brand-800">{{ puedeAgendar ? 'Últimos informes' : 'Mis últimos informes' }}</h3>
            <button class="text-xs font-semibold text-brand-700 underline" @click="$emit('informes', '')">Ver todos</button>
          </div>
          <p v-if="!datos.ultimosInformes.length" class="py-3 text-sm text-brand-700/70">Todavía no hay informes.</p>
          <ul v-else class="grid gap-2">
            <li v-for="i in datos.ultimosInformes" :key="i.id">
              <button class="flex w-full items-center gap-3 rounded-xl border-l-4 bg-brand-50/70 px-3 py-2 text-left active:bg-brand-100" :class="bordeDeEstado(i.estado)" @click="$emit('informe', i.id)">
                <span class="grid min-w-0 flex-1 gap-0.5">
                  <span class="font-mono text-[11px] font-semibold text-brand-600">{{ i.numero || 'Sin número' }}</span>
                  <b class="truncate text-sm text-brand-900">{{ i.titulo }}</b>
                  <Dato :icono="Building2" etiqueta="Cliente">{{ i.cliente }}</Dato>
                </span>
                <EstadoBadge :estado="i.estado" />
              </button>
            </li>
          </ul>
        </div>
      </div>

      </template>

      <!-- Superadministrador: solo personaliza la empresa y gestiona a sus administradores -->
      <div v-if="esSuper" class="tarjeta grid gap-2">
        <h3 class="font-semibold text-brand-800">Tu empresa</h3>
        <p class="text-sm text-brand-700">Personaliza sus datos, logo, colores e informes, y crea la cuenta de su administrador.</p>
        <div class="flex flex-wrap gap-2">
          <button class="btn min-h-10 flex-none text-sm" @click="$emit('ir', 'ajustes')"><Settings :size="16" aria-hidden="true" />Personalizar la empresa</button>
          <button class="btn-borde min-h-10 flex-none text-sm" @click="$emit('ir', 'usuarios')"><ShieldCheck :size="16" aria-hidden="true" />Administradores</button>
        </div>
      </div>

      <!-- Empresas (solo el root) -->
      <div v-if="esPlataforma && pl" class="tarjeta grid gap-2">
        <div class="flex items-center justify-between">
          <h3 class="flex items-center gap-2 font-semibold text-brand-800"><Building2 :size="18" aria-hidden="true" />Plataforma</h3>
          <button class="text-xs font-semibold text-brand-700 underline" @click="$emit('ir', 'empresas')">Administrar empresas</button>
        </div>
        <ul class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <li class="rounded-xl bg-brand-50 p-2.5"><span class="block text-xs text-brand-700">Empresas</span><b class="text-xl text-brand-900">{{ pl.empresas }}</b></li>
          <li class="rounded-xl bg-brand-50 p-2.5"><span class="block text-xs text-brand-700">Activas</span><b class="text-xl text-brand-900">{{ pl.activas }}</b></li>
          <li class="rounded-xl bg-brand-50 p-2.5"><span class="block text-xs text-brand-700">Usuarios activos</span><b class="text-xl text-brand-900">{{ pl.usuarios }}</b></li>
          <li class="rounded-xl bg-brand-50 p-2.5"><span class="block text-xs text-brand-700">Nuevas este mes</span><b class="text-xl text-brand-900">{{ pl.nuevasMes }}</b></li>
        </ul>
        <p class="text-xs text-brand-700">Por plan: <template v-for="(n, plan) in pl.porPlan" :key="plan"><b class="text-brand-900">{{ plan }}</b> {{ n }}&nbsp;&nbsp;</template></p>
      </div>
    </template>
  </section>
</template>
