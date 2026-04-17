<template>
  <div class="step-indicator">
    <template v-for="(step, i) in steps" :key="step.key">
      <div
        class="step-item"
        :class="{
          completed: i < currentIndex,
          active: i === currentIndex,
        }"
        @click="$emit('click', step.key)"
      >
        <span class="step-number">
          <Check v-if="i < currentIndex" :size="12" :stroke-width="3" />
          <template v-else>{{ i + 1 }}</template>
        </span>
        <span>{{ step.label }}</span>
      </div>
      <div
        v-if="i < steps.length - 1"
        class="step-connector"
        :class="{
          completed: i < currentIndex,
          active: i === currentIndex - 1,
        }"
      ></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Check } from 'lucide-vue-next'

const props = defineProps<{
  steps: Array<{ key: string; label: string }>
  current: string
}>()

defineEmits<{
  click: [key: string]
}>()

const currentIndex = computed(() =>
  props.steps.findIndex((s) => s.key === props.current),
)
</script>
