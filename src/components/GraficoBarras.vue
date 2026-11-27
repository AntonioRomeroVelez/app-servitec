<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'

// Gráfico de columnas de UNA serie (p. ej. visitas por día). Sin leyenda (el título dice qué se mide), barras finas con el
// extremo redondeado y la base recta, cuadrícula discreta, valor solo en el máximo y en el elemento destacado, tooltip al
// pasar o enfocar cada columna y una vista de tabla que da acceso a todos los valores sin depender del gráfico.
// datos: [{ etiqueta, sub?, valor, detalle, destacado? }]  detalle = texto completo para el tooltip y la tabla ("vie 20 nov").
const props = defineProps({
  datos: { type: Array, required: true },
  unidad: { type: String, default: 'visitas' },
  alto: { type: Number, default: 170 },
})

// El ancho del dibujo es el del contenedor: así la altura y el tamaño del texto no crecen en pantallas anchas
const raiz = ref(null)
const W = ref(560)
let observador
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  observador = new ResizeObserver(([e]) => (W.value = Math.max(320, Math.round(e.contentRect.width))))
  observador.observe(raiz.value)
})
onBeforeUnmount(() => observador?.disconnect())
const M = { arriba: 16, abajo: 38, izq: 26, der: 6 }
const base = computed(() => props.alto - M.abajo)
const maximo = computed(() => Math.max(0, ...props.datos.map((d) => d.valor)))
const techo = computed(() => (maximo.value <= 4 ? 4 : Math.ceil(maximo.value / 4) * 4)) // marcas enteras: 0, mitad, techo
const marcas = computed(() => [0, techo.value / 2, techo.value])
const banda = computed(() => (W.value - M.izq - M.der) / Math.max(1, props.datos.length))
const grosor = computed(() => Math.min(18, banda.value - 10))
const yDe = (v) => M.arriba + (1 - v / techo.value) * (base.value - M.arriba)

const indiceMaximo = computed(() => props.datos.findIndex((d) => d.valor === maximo.value)) // solo el primero: nunca un número en cada barra

const barras = computed(() =>
  props.datos.map((d, i) => {
    const cx = M.izq + banda.value * (i + 0.5)
    const x = cx - grosor.value / 2
    const y = yDe(d.valor)
    const h = base.value - y
    const r = Math.min(4, h) // extremo de datos redondeado (4px); la base queda recta
    const trazo = h > 0 ? `M${x},${base.value} V${y + r} Q${x},${y} ${x + r},${y} H${x + grosor.value - r} Q${x + grosor.value},${y} ${x + grosor.value},${y + r} V${base.value} Z` : ''
    return { ...d, cx, x, y, trazo, etiquetaValor: d.valor > 0 && (i === indiceMaximo.value || d.destacado) }
  }),
)

const activo = ref(-1)
const verTabla = ref(false)
const tip = computed(() => (activo.value >= 0 ? barras.value[activo.value] : null))
const izquierdaTip = computed(() => (tip.value ? Math.min(88, Math.max(12, (tip.value.cx / W.value) * 100)) : 0))
const texto = (d) => `${d.detalle}: ${d.valor} ${d.valor === 1 ? props.unidad.replace(/s$/, '') : props.unidad}`
</script>

<template>
  <div ref="raiz">
    <div v-if="!verTabla" class="relative" @pointerleave="activo = -1">
      <svg :viewBox="`0 0 ${W} ${alto}`" class="block w-full" role="group" :aria-label="`Gráfico de columnas: ${unidad} por día`">
        <!-- cuadrícula y eje (hairline, sin competir con los datos) -->
        <g class="text-brand-700/60">
          <template v-for="m in marcas" :key="m">
            <line :x1="M.izq" :x2="W - M.der" :y1="yDe(m)" :y2="yDe(m)" class="stroke-brand-100" stroke-width="1" />
            <text :x="M.izq - 6" :y="yDe(m) + 3" text-anchor="end" class="fill-current text-[10px]">{{ m }}</text>
          </template>
        </g>
        <line :x1="M.izq" :x2="W - M.der" :y1="base" :y2="base" class="stroke-brand-300" stroke-width="1" />

        <g v-for="(b, i) in barras" :key="i">
          <path v-if="b.trazo" :d="b.trazo" :class="[b.destacado ? 'fill-brand-800' : 'fill-brand-500', activo === i ? 'opacity-75' : '']" />
          <text v-if="b.etiquetaValor" :x="b.cx" :y="b.y - 5" text-anchor="middle" class="fill-brand-900 text-[11px] font-semibold">{{ b.valor }}</text>
          <text :x="b.cx" :y="base + 14" text-anchor="middle" class="text-[10px]" :class="b.destacado ? 'fill-brand-900 font-bold' : 'fill-brand-700'">{{ b.etiqueta }}</text>
          <text :x="b.cx" :y="base + 26" text-anchor="middle" class="fill-brand-700/60 text-[9px]">{{ b.sub }}</text>
          <!-- zona de contacto: toda la columna (mucho más ancha que la barra) -->
          <rect
            :x="M.izq + banda * i"
            :y="0"
            :width="banda"
            :height="alto"
            fill="transparent"
            tabindex="0"
            role="img"
            :aria-label="texto(b)"
            class="cursor-default outline-none focus-visible:stroke-brand-600"
            @pointerenter="activo = i"
            @focus="activo = i"
            @blur="activo = -1"
          />
        </g>
      </svg>
      <div v-if="tip" class="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-brand-100 bg-white px-2.5 py-1.5 text-xs shadow-md" :style="{ left: `${izquierdaTip}%` }" role="status">
        <p class="text-base leading-tight font-bold text-brand-900">{{ tip.valor }}</p>
        <p class="text-brand-700">{{ tip.detalle }}</p>
      </div>
    </div>

    <table v-else class="w-full text-sm">
      <caption class="sr-only">{{ unidad }} por día</caption>
      <thead>
        <tr class="border-b border-brand-100 text-left text-xs text-brand-700/70"><th class="py-1 font-medium">Día</th><th class="py-1 text-right font-medium">{{ unidad }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="d in datos" :key="d.detalle" class="border-b border-brand-50" :class="d.destacado ? 'font-bold text-brand-900' : 'text-brand-800'">
          <td class="py-1">{{ d.detalle }}</td>
          <td class="py-1 text-right">{{ d.valor }}</td>
        </tr>
      </tbody>
    </table>

    <button type="button" class="enlace !-mt-2.5" @click="verTabla = !verTabla">{{ verTabla ? 'Ver gráfico' : 'Ver como tabla' }}</button>
  </div>
</template>
