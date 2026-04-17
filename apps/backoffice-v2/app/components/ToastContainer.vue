<template>
  <Teleport to="body">
    <div class="toast-container">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="`toast-${toast.type}`"
      >
        <component :is="iconMap[toast.type]" :size="18" :stroke-width="2" class="toast-icon" :style="{ color: colorMap[toast.type] }" />
        <span>{{ toast.message }}</span>
        <button class="toast-close" @click="removeToast(toast.id)">
          <X :size="14" :stroke-width="2" />
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-vue-next'

const { toasts, removeToast } = useToast()

const iconMap: Record<string, any> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const colorMap: Record<string, string> = {
  success: 'var(--color-success)',
  error: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  info: 'var(--color-primary)',
}
</script>
