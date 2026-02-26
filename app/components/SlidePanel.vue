<template>
  <Teleport to="body">
    <div v-if="modelValue" class="slide-panel-overlay" @click="closePanel"></div>
    <div
      v-if="modelValue"
      ref="panelRef"
      class="slide-panel"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      tabindex="-1"
    >
      <div class="slide-panel-header">
        <h3 class="slide-panel-title">{{ title }}</h3>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          aria-label="패널 닫기"
          @click="closePanel"
        >
          <X :size="18" :stroke-width="2" />
        </button>
      </div>
      <div class="slide-panel-body">
        <slot />
      </div>
      <div v-if="$slots.footer" class="slide-panel-footer">
        <slot name="footer" />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: boolean
  title: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const panelRef = ref<HTMLElement | null>(null)
let lastFocusedElement: HTMLElement | null = null

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function closePanel() {
  emit('update:modelValue', false)
}

function getFocusableElements() {
  if (!panelRef.value) return [] as HTMLElement[]
  return Array.from(panelRef.value.querySelectorAll<HTMLElement>(focusableSelector))
}

function onKeydown(e: KeyboardEvent) {
  if (!props.modelValue) return

  if (e.key === 'Escape') {
    e.preventDefault()
    closePanel()
    return
  }

  if (e.key !== 'Tab') return

  const focusable = getFocusableElements()
  if (!focusable.length) {
    e.preventDefault()
    panelRef.value?.focus()
    return
  }

  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  const active = document.activeElement as HTMLElement | null

  if (e.shiftKey && (active === first || !panelRef.value?.contains(active))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (active === last || !panelRef.value?.contains(active))) {
    e.preventDefault()
    first.focus()
  }
}

watch(() => props.modelValue, async (open) => {
  if (open) {
    lastFocusedElement = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', onKeydown)
    await nextTick()
    const focusable = getFocusableElements()
    ;(focusable[0] || panelRef.value)?.focus()
    return
  }

  document.removeEventListener('keydown', onKeydown)
  lastFocusedElement?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>
