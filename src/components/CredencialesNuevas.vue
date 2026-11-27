<script setup>
import { ref } from 'vue'
import { Check, Copy } from 'lucide-vue-next'

// Muestra el usuario generado y la clave temporal tras crear una cuenta, para entregárselos a la persona.
// `deRoot`: en las cuentas que crea el root la clave temporal es su cédula, no la de la persona.
const props = defineProps({ accion: { type: String, default: 'Cuenta creada' }, nombre: String, usuario: { type: String, required: true }, clave: { type: String, required: true }, deRoot: Boolean })
defineEmits(['listo'])

const copiado = ref(false)
async function copiar() {
  try {
    await navigator.clipboard.writeText(`Usuario: ${props.usuario}\nClave temporal: ${props.clave}`)
    copiado.value = true
    setTimeout(() => (copiado.value = false), 2500)
  } catch {
    /* sin permiso para copiar: se pueden leer en pantalla */
  }
}
</script>

<template>
  <div class="grid gap-3">
    <p class="text-sm text-brand-800">
      {{ accion }}{{ nombre ? ` para ${nombre}` : '' }}. Entrégale estos datos: con ellos ingresa a la plataforma y deberá crear una clave nueva en su primer ingreso.
    </p>
    <dl class="grid gap-2 rounded-xl bg-brand-50 p-3 text-sm">
      <div>
        <dt class="text-xs text-brand-700/70">Usuario</dt>
        <dd class="font-mono text-base font-bold break-all text-brand-900">{{ usuario }}</dd>
      </div>
      <div>
        <dt class="text-xs text-brand-700/70">{{ deRoot ? 'Clave temporal (tu número de cédula)' : 'Clave temporal (su número de cédula)' }}</dt>
        <dd class="font-mono text-base font-bold break-all text-brand-900">{{ clave }}</dd>
      </div>
    </dl>
    <p class="text-xs text-brand-700/80">{{ deRoot ? 'Se puede restablecer desde Empresas > Superadministrador.' : 'Es su número de cédula: se puede volver a restablecer desde su tarjeta, con «Restablecer clave».' }}</p>
    <div class="pie-fijo !flex sm:justify-end">
      <button type="button" class="btn-borde min-h-11" @click="copiar">
        <Check v-if="copiado" :size="18" aria-hidden="true" />
        <Copy v-else :size="18" aria-hidden="true" />
        {{ copiado ? 'Copiado' : 'Copiar' }}
      </button>
      <button type="button" class="btn min-h-11" @click="$emit('listo')">Listo</button>
    </div>
  </div>
</template>
