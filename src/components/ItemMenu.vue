<script setup>
import { ChevronDown } from 'lucide-vue-next'

// Un elemento del menú lateral. Si tiene `hijos` es un grupo que se despliega en cascada (y puede contener otros grupos);
// si no, es un botón que navega. Es recursivo: se llama a sí mismo para dibujar los subbotones.
//   nodo = { id, texto, icono?, insignia?, activo, hijos? }
defineProps({
  nodo: { type: Object, required: true },
  nivel: { type: Number, default: 0 },
  abiertos: { type: Object, required: true }, // Set con los ids de los grupos desplegados
})
const emit = defineEmits(['elegir', 'alternar'])
</script>

<template>
  <li>
    <!-- Grupo: se despliega y se pliega -->
    <button
      v-if="nodo.hijos"
      class="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm active:bg-brand-50"
      :class="[nivel === 0 ? 'font-semibold text-brand-900' : 'font-medium text-brand-800', nodo.activo ? 'bg-brand-50' : '']"
      :aria-expanded="abiertos.has(nodo.id)"
      @click="emit('alternar', nodo.id)"
    >
      <component :is="nodo.icono" v-if="nodo.icono" :size="20" class="shrink-0 text-brand-600" aria-hidden="true" />
      <span class="flex-1">{{ nodo.texto }}</span>
      <span v-if="nodo.insignia" class="flex min-w-5 items-center justify-center rounded-full bg-acento px-1.5 text-[11px] leading-5 font-bold text-acento-texto">{{ nodo.insignia }}</span>
      <ChevronDown :size="18" class="shrink-0 text-brand-700/60 transition-transform duration-150" :class="{ 'rotate-180': abiertos.has(nodo.id) }" aria-hidden="true" />
    </button>

    <!-- Botón final: navega -->
    <button
      v-else
      class="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm active:bg-brand-50"
      :class="[nodo.activo ? 'bg-brand-100 font-semibold text-brand-800' : nivel === 0 ? 'font-semibold text-brand-900' : 'text-brand-800']"
      :aria-current="nodo.activo ? 'page' : undefined"
      @click="emit('elegir', nodo)"
    >
      <component :is="nodo.icono" v-if="nodo.icono" :size="20" class="shrink-0 text-brand-600" aria-hidden="true" />
      <span class="flex-1">{{ nodo.texto }}</span>
      <span v-if="nodo.insignia" class="flex min-w-5 items-center justify-center rounded-full bg-acento px-1.5 text-[11px] leading-5 font-bold text-acento-texto">{{ nodo.insignia }}</span>
    </button>

    <!-- Subbotones en cascada, con una línea guía a la izquierda -->
    <ul v-if="nodo.hijos && abiertos.has(nodo.id)" class="mt-0.5 mb-1 ml-6 grid gap-0.5 border-l-2 border-brand-100 pl-2">
      <ItemMenu v-for="h in nodo.hijos" :key="h.id" :nodo="h" :nivel="nivel + 1" :abiertos="abiertos" @elegir="(n) => emit('elegir', n)" @alternar="(id) => emit('alternar', id)" />
    </ul>
  </li>
</template>
