<template>
  <div class="automation-home">
    <div class="page-header">
      <span class="page-kicker">반복 작업</span>
      <h1 class="page-title">업무 자동화</h1>
      <span class="page-subtitle">반복 작업을 바로 실행할 수 있게 정리했습니다.</span>
    </div>

    <div class="card-grid">
      <NuxtLink to="/automation/argo-order" class="card action-card">
        <div class="action-icon">
          <FileSpreadsheet :size="20" :stroke-width="1.8" />
        </div>
        <div class="action-body">
          <span class="action-meta">배송지 파일</span>
          <h3>아르고 발주 변환</h3>
          <p>여러 파일을 한 번에 아르고 양식으로 정리합니다.</p>
        </div>
        <ChevronRight :size="18" :stroke-width="2" class="action-arrow" />
      </NuxtLink>

      <NuxtLink to="/automation/blog-media" class="card action-card">
        <div class="action-icon">
          <ImageDown :size="20" :stroke-width="1.8" />
        </div>
        <div class="action-body">
          <span class="action-meta">URL 수집</span>
          <h3>블로그 미디어 수집</h3>
          <p>네이버 블로그 이미지와 영상을 순차 저장합니다.</p>
        </div>
        <ChevronRight :size="18" :stroke-width="2" class="action-arrow" />
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronRight, FileSpreadsheet, ImageDown } from 'lucide-vue-next'

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
  gap: 6px;
}

.page-kicker {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
}

.page-title {
  font-size: 1.25rem;
  font-weight: 760;
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
  min-height: 124px;
  border-color: var(--color-border);
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.action-card:hover {
  border-color: var(--color-border-strong);
  background: #fbfdff;
}

.action-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f3f7fd;
  color: #2563eb;
  flex-shrink: 0;
  border: 1px solid rgba(223, 231, 240, 0.96);
}

.action-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.action-meta {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.action-body h3 {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.02em;
}

.action-body p {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.action-arrow {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
