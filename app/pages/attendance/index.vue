<template>
  <div class="attendance-home">
    <div class="page-header">
      <h1 class="page-title">근태 관리</h1>
      <span class="page-subtitle">출퇴근 기록과 월별 근태 조회를 관리합니다.</span>
    </div>

    <div class="card-grid">
      <NuxtLink to="/attendance/records" class="card action-card">
        <div class="action-icon">
          <Clock3 :size="20" :stroke-width="1.8" />
        </div>
        <div class="action-body">
          <h3>출퇴근 기록</h3>
          <p>오늘 출근/퇴근 시간 기록 및 개인 근태 조회</p>
        </div>
      </NuxtLink>

      <div class="card action-card disabled">
        <div class="action-icon disabled">
          <ClipboardCheck :size="20" :stroke-width="1.8" />
        </div>
        <div class="action-body">
          <h3>근태 승인/정정</h3>
          <p>정정 요청 처리 및 승인 워크플로우 (준비중)</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Clock3, ClipboardCheck } from 'lucide-vue-next'

definePageMeta({ layout: 'home' })
</script>

<style scoped>
.attendance-home {
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
  opacity: 0.64;
  pointer-events: none;
}

@media (max-width: 768px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
