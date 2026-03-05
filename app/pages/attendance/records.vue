<template>
  <div class="records-page">
    <div class="records-header">
      <h1 class="records-title">출퇴근 기록</h1>
      <span class="records-subtitle">근태관리 1차 화면: 출근/퇴근 기록 구조 확인용</span>
    </div>

    <div class="card status-card">
      <div class="status-row">
        <span class="status-label">이름</span>
        <strong>{{ user.name || '-' }}</strong>
      </div>
      <div class="status-row">
        <span class="status-label">권한</span>
        <strong>{{ roleLabel }}</strong>
      </div>
      <div class="status-row">
        <span class="status-label">기준일</span>
        <strong>{{ today }}</strong>
      </div>
    </div>

    <div class="card action-card">
      <div class="action-title">근태 기록 액션</div>
      <div class="action-buttons">
        <button type="button" class="btn btn-primary" disabled>출근 기록 (준비중)</button>
        <button type="button" class="btn btn-ghost" disabled>퇴근 기록 (준비중)</button>
      </div>
      <p class="action-note">
        다음 단계에서 `attendance_records` 테이블 연동 후 실제 출퇴근 기록을 저장합니다.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'home' })

const { user, profileLoaded } = useCurrentUser()

const today = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

const roleLabel = computed(() => {
  if (!profileLoaded.value) return '확인중'
  if (user.value.role === 'admin') return '관리자'
  if (user.value.role === 'modifier') return '수정자'
  return '열람자'
})
</script>

<style scoped>
.records-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.records-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.records-title {
  font-size: 1.125rem;
  font-weight: 700;
}

.records-subtitle {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.status-card {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-md);
}

.status-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.action-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.action-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.action-buttons {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.action-note {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

@media (max-width: 768px) {
  .status-card {
    grid-template-columns: 1fr;
  }
}
</style>
