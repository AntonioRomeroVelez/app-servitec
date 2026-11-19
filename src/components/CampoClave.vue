<script setup>
import { ref } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'

// Campo de clave con botón para mostrar u ocultar lo escrito. Úsalo dentro de un <label class="etiqueta">.
const modelo = defineModel({ type: String, default: '' })
defineProps({
  autocomplete: { type: String, default: 'current-password' },
  required: Boolean,
  minlength: { type: [String, Number], default: undefined },
})

const visible = ref(false)
</script>

<template>
  <div class="relative">
    <input
      v-model="modelo"
      :type="visible ? 'text' : 'password'"
      class="campo pr-12!"
      :autocomplete="autocomplete"
      :required="required"
      :minlength="minlength"
      autocapitalize="none"
      spellcheck="false"
    />
    <button
      type="button"
      class="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-brand-700 active:bg-brand-50"
      :aria-label="visible ? 'Ocultar clave' : 'Mostrar clave'"
      :aria-pressed="visible"
      @click="visible = !visible"
    >
      <EyeOff v-if="visible" :size="20" aria-hidden="true" />
      <Eye v-else :size="20" aria-hidden="true" />
    </button>
  </div>
</template>
