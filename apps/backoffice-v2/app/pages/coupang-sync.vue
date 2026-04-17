<template>
  <div class="sync-redirect-shell">
    <span class="sync-redirect-copy">주문 동기화 화면으로 이동 중입니다.</span>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()

await navigateTo({
  path: '/naver-sync',
  query: {
    ...route.query,
    channel: 'coupang',
  },
}, { replace: true })
</script>

<style scoped>
.sync-redirect-shell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
}

.sync-redirect-copy {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-muted);
}
</style>
