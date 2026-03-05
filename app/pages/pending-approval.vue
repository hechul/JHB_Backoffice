<template>
  <div class="pending-page">
    <div class="pending-card">
      <div class="pending-head">
        <img src="/jhbiofarm-logo.png" alt="JHBioFarm 로고" class="pending-logo" />
        <h1 class="pending-title">승인 대기 중</h1>
      </div>

      <p class="pending-desc">
        관리자 승인 후 백오피스 및 근태관리 기능을 이용할 수 있습니다.
      </p>

      <div class="pending-status">
        <span class="pending-label">현재 상태</span>
        <strong>{{ statusLabel }}</strong>
      </div>

      <div class="pending-actions">
        <button class="btn btn-secondary" type="button" @click="refreshProfile">상태 다시 확인</button>
        <button class="btn btn-ghost" type="button" @click="logout">로그아웃</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const { user, fetchProfile, logout } = useCurrentUser()
const supabaseUser = useSupabaseUser()

const statusLabel = computed(() => {
  const status = String(user.value.status || '').toLowerCase()
  if (status === 'pending') return '승인 대기'
  if (status === 'rejected') return '승인 반려'
  if (status === 'inactive') return '비활성'
  return '확인 중'
})

async function refreshProfile() {
  const uid = supabaseUser.value?.id
  if (!uid) return
  await fetchProfile(uid)
}
</script>

<style scoped>
.pending-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  padding: 24px;
}

.pending-card {
  width: 100%;
  max-width: 480px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pending-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pending-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.pending-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;
}

.pending-desc {
  font-size: 0.875rem;
  color: #6b7280;
  line-height: 1.5;
}

.pending-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
}

.pending-label {
  font-size: 0.8125rem;
  color: #6b7280;
}

.pending-status strong {
  font-size: 0.875rem;
  color: #111827;
}

.pending-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
</style>
