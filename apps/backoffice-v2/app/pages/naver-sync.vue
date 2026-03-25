<template>
  <div class="sync-page">
    <div class="card sync-intro-card">
      <div class="card-header">
        <h3 class="card-title">
          <CloudDownload :size="18" :stroke-width="1.8" style="color: var(--color-primary)" />
          주문 동기화
        </h3>
        <StatusBadge label="고객 관리" variant="info" dot />
      </div>
      <p class="text-sm text-secondary">
        네이버 스마트스토어 주문은 이 페이지에서만 동기화합니다. 체험단 엑셀 업로드는 기존처럼 데이터 업로드 화면에서 진행하면 됩니다.
      </p>
    </div>

    <NaverSyncPanel />
  </div>
</template>

<script setup lang="ts">
import { CloudDownload } from 'lucide-vue-next'
</script>

<style scoped>
.sync-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.sync-intro-card {
  border: 1px solid rgba(59, 130, 246, 0.14);
}
</style>
