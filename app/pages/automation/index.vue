<template>
  <div class="automation-home">
    <div class="page-header">
      <h1 class="page-title">업무 자동화</h1>
      <span class="page-subtitle">반복 작업을 파일 업로드 한 번으로 처리합니다.</span>
    </div>

    <div class="card-grid">
      <NuxtLink to="/automation/argo-order" class="card action-card">
        <div class="action-icon">
          <FileSpreadsheet :size="20" :stroke-width="1.8" />
        </div>
        <div class="action-body">
          <h3>아르고 발주 변환</h3>
          <p>체험단 배송지 파일을 아르고 발주 양식으로 자동 변환합니다.</p>
        </div>
      </NuxtLink>

      <div class="card action-card disabled">
        <div class="action-icon disabled">
          <ImageDown :size="20" :stroke-width="1.8" />
        </div>
        <div class="action-body">
          <h3>블로그 미디어 수집</h3>
          <p>네이버 블로그 이미지/동영상 일괄 저장 (준비중)</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FileSpreadsheet, ImageDown } from 'lucide-vue-next'

definePageMeta({ layout: 'home' })
</script>

<style scoped>
.automation-home {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.page-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.page-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text);
}

.page-subtitle {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-lg);
}

.action-card {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  min-height: 112px;
  transition: all 0.16s ease;
}

.action-card:hover {
  border-color: #D1D5DB;
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.action-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #EFF6FF;
  color: #1D4ED8;
  flex-shrink: 0;
}

.action-icon.disabled {
  background: #F3F4F6;
  color: #9CA3AF;
}

.action-body h3 {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 2px;
}

.action-body p {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.action-card.disabled {
  opacity: 0.6;
  pointer-events: none;
}

@media (max-width: 768px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
