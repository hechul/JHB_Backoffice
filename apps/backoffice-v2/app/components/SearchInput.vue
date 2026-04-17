<template>
  <div class="input-with-icon" :style="{ width }">
    <Search :size="16" :stroke-width="2" class="input-icon" />
    <input
      :value="modelValue"
      class="input"
      type="text"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      v-if="modelValue"
      type="button"
      class="search-clear"
      aria-label="검색어 지우기"
      @click="$emit('update:modelValue', '')"
    >
      <X :size="14" :stroke-width="2" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'

withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  width?: string
}>(), {
  placeholder: '검색...',
  width: '100%',
})

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<style scoped>
.search-clear {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  padding: 2px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.search-clear:hover {
  color: var(--color-text);
  background: var(--color-bg);
}
.input {
  padding-right: 32px;
}
</style>
