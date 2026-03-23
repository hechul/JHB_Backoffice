<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-overlay" @click="closeModal">
      <div
        ref="modalRef"
        class="modal-content card"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
        @click.stop
      >
        <div class="flex items-center gap-md mb-lg">
          <div
            v-if="variant"
            class="modal-icon-wrap"
            :style="{ background: variantStyles.bg }"
          >
            <component :is="variantStyles.icon" :size="20" :stroke-width="2" :style="{ color: variantStyles.color }" />
          </div>
          <h3 class="text-lg font-semibold">{{ title }}</h3>
        </div>
        <div class="text-sm text-secondary" style="line-height: 1.7">
          <slot />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="closeModal">
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            class="btn"
            :class="confirmClass"
            @click="$emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  variant?: 'warning' | 'danger' | 'info' | 'success'
  confirmLabel?: string
  cancelLabel?: string
}>(), {
  confirmLabel: '확인',
  cancelLabel: '취소',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()

const variantMap = {
  warning: { icon: AlertTriangle, color: 'var(--color-warning)', bg: 'var(--color-warning-light)', btn: 'btn-primary' },
  danger: { icon: XCircle, color: 'var(--color-danger)', bg: 'var(--color-danger-light)', btn: 'btn-danger' },
  info: { icon: Info, color: 'var(--color-primary)', bg: 'var(--color-primary-light)', btn: 'btn-primary' },
  success: { icon: CheckCircle, color: 'var(--color-success)', bg: 'var(--color-success-light)', btn: 'btn-primary' },
}

const variantStyles = computed(() => variantMap[props.variant || 'info'])
const confirmClass = computed(() => variantStyles.value.btn)

const modalRef = ref<HTMLElement | null>(null)
let lastFocusedElement: HTMLElement | null = null

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function closeModal() {
  emit('update:modelValue', false)
}

function getFocusableElements() {
  if (!modalRef.value) return [] as HTMLElement[]
  return Array.from(modalRef.value.querySelectorAll<HTMLElement>(focusableSelector))
}

function onKeydown(e: KeyboardEvent) {
  if (!props.modelValue) return

  if (e.key === 'Escape') {
    e.preventDefault()
    closeModal()
    return
  }

  if (e.key !== 'Tab') return

  const focusable = getFocusableElements()
  if (!focusable.length) {
    e.preventDefault()
    modalRef.value?.focus()
    return
  }

  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  const active = document.activeElement as HTMLElement | null

  if (e.shiftKey && (active === first || !modalRef.value?.contains(active))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (active === last || !modalRef.value?.contains(active))) {
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
    ;(focusable[0] || modalRef.value)?.focus()
    return
  }

  document.removeEventListener('keydown', onKeydown)
  lastFocusedElement?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.modal-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
