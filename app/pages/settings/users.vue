<template>
  <div class="users-page">
    <div v-if="isViewer" class="card empty-state">
      <Shield :size="32" :stroke-width="1.8" class="empty-state-icon" />
      <div class="empty-state-title">접근 권한이 없습니다</div>
      <div class="empty-state-desc">계정 관리는 관리자 권한에서만 접근할 수 있습니다.</div>
    </div>

    <template v-else>
      <!-- Page Header -->
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">계정 관리</h1>
          <span class="page-count badge badge-neutral">{{ users.length }}명</span>
        </div>
        <button class="btn btn-primary" @click="showInviteModal = true">
          <UserPlus :size="16" :stroke-width="2" />
          초대하기
        </button>
      </div>

      <!-- User Cards -->
      <div class="user-grid">
        <div v-for="u in users" :key="u.id" class="user-card card">
          <div class="user-card-top">
            <div class="user-avatar-lg">{{ u.name.charAt(0) }}</div>
            <div class="user-meta">
              <span class="user-card-name">{{ u.name }}</span>
              <span class="user-card-email">{{ u.email }}</span>
            </div>
          </div>
          <div class="user-card-badges">
            <span class="badge" :class="u.role === 'admin' ? 'badge-primary' : 'badge-neutral'">
              <Shield :size="10" :stroke-width="2" />
              {{ u.role === 'admin' ? '관리자' : '열람자' }}
            </span>
            <span class="badge" :class="u.status === 'active' ? 'badge-success' : 'badge-danger'">
              {{ u.status === 'active' ? '활성' : '비활성' }}
            </span>
          </div>
          <div class="user-card-footer">
            <span class="user-joined text-muted">가입일: {{ u.createdAt }}</span>
            <div class="user-actions">
              <button
                class="btn btn-ghost btn-sm"
                @click="toggleStatus(u)"
              >
                {{ u.status === 'active' ? '비활성화' : '활성화' }}
              </button>
              <button class="btn btn-ghost btn-sm text-danger" @click="confirmDelete(u)">
                <Trash2 :size="14" :stroke-width="1.8" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Invite Modal -->
      <Transition name="fade">
        <div v-if="showInviteModal" class="modal-overlay" @click="showInviteModal = false">
          <div class="modal-content card" @click.stop>
            <h3 class="modal-title">
              <UserPlus :size="20" :stroke-width="1.8" />
              관리자 초대
            </h3>
            <div class="modal-form">
              <div class="detail-group">
                <label class="label">이메일 <span class="required">*</span></label>
                <input v-model="inviteEmail" class="input" type="email" placeholder="초대할 이메일 입력" />
              </div>
              <div class="detail-group">
                <label class="label">권한</label>
                <select v-model="inviteRole" class="select" style="width:100%">
                  <option value="viewer">열람자 (읽기 전용)</option>
                  <option value="admin">관리자 (전체 권한)</option>
                </select>
              </div>
            </div>
            <div class="modal-actions">
              <button class="btn btn-secondary" @click="showInviteModal = false">취소</button>
              <button class="btn btn-primary" @click="sendInvite">초대 보내기</button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Delete Confirm Modal -->
      <Transition name="fade">
        <div v-if="deleteTarget" class="modal-overlay" @click="deleteTarget = null">
          <div class="modal-content card" @click.stop>
            <h3 class="modal-title text-danger">계정 삭제 확인</h3>
            <p class="modal-desc">
              <strong>{{ deleteTarget.name }}</strong>({{ deleteTarget.email }}) 계정을 삭제하시겠습니까?
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div class="modal-actions">
              <button class="btn btn-secondary" @click="deleteTarget = null">취소</button>
              <button class="btn btn-danger" @click="deleteUser">삭제</button>
            </div>
          </div>
        </div>
      </Transition>
    </template>
  </div>
</template>

<script setup lang="ts">
import { UserPlus, Shield, Trash2 } from 'lucide-vue-next'

definePageMeta({ layout: 'default' })
const { isViewer } = useCurrentUser()

interface User {
  id: string
  name: string
  email: string
  role: string
  status: string
  createdAt: string
}

const showInviteModal = ref(false)
const inviteEmail = ref('')
const inviteRole = ref('viewer')
const deleteTarget = ref<User | null>(null)

const users = ref<User[]>([
  { id: 'u1', name: '김관리', email: 'admin@jhbiofarm.co.kr', role: 'admin', status: 'active', createdAt: '2024-06-15' },
  { id: 'u2', name: '이운영', email: 'ops@jhbiofarm.co.kr', role: 'admin', status: 'active', createdAt: '2024-09-01' },
  { id: 'u3', name: '박뷰어', email: 'viewer@jhbiofarm.co.kr', role: 'viewer', status: 'active', createdAt: '2025-01-10' },
])

function toggleStatus(u: User) {
  u.status = u.status === 'active' ? 'inactive' : 'active'
}

function confirmDelete(u: User) {
  deleteTarget.value = u
}

function deleteUser() {
  if (deleteTarget.value) {
    users.value = users.value.filter(u => u.id !== deleteTarget.value!.id)
    deleteTarget.value = null
  }
}

function sendInvite() {
  if (!inviteEmail.value) return
  const id = `u${users.value.length + 1}`
  users.value.push({
    id,
    name: inviteEmail.value.split('@')[0] || '신규',
    email: inviteEmail.value,
    role: inviteRole.value,
    status: 'active',
    createdAt: new Date().toISOString().split('T')[0]!,
  })
  inviteEmail.value = ''
  inviteRole.value = 'viewer'
  showInviteModal.value = false
}
</script>

<style scoped>
.users-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.page-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text);
}

.page-count {
  font-size: 0.75rem;
}

/* User Grid */
.user-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-lg);
}

.user-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.user-card-top {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.user-avatar-lg {
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-primary);
  flex-shrink: 0;
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.user-card-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
}

.user-card-email {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-card-badges {
  display: flex;
  gap: var(--space-sm);
}

.user-card-badges .badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.user-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-md);
  border-top: 1px solid var(--color-border-light);
}

.user-joined {
  font-size: 0.75rem;
}

.user-actions {
  display: flex;
  gap: var(--space-xs);
}

.text-danger {
  color: var(--color-danger);
}

/* Modal */
.modal-title {
  font-size: 1.0625rem;
  font-weight: 600;
  margin-bottom: var(--space-xl);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.modal-form {
  margin-bottom: var(--space-lg);
}

.modal-desc {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin-bottom: var(--space-xl);
}

.detail-group {
  margin-bottom: var(--space-lg);
}

/* Transitions */
.fade-enter-active { animation: fadeIn 0.15s ease; }
.fade-leave-active { animation: fadeIn 0.1s ease reverse; }
.fade-enter-active .modal-content { animation: scaleIn 0.15s ease; }
.fade-leave-active .modal-content { animation: scaleIn 0.1s ease reverse; }
</style>
