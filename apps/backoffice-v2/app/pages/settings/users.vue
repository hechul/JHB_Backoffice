<template>
  <div class="users-page">
    <div v-if="!profileLoaded" class="card empty-state">
      <div class="empty-state-title">권한 확인 중</div>
    </div>

    <div v-else-if="!isAdmin" class="card empty-state">
      <Shield :size="32" :stroke-width="1.8" class="empty-state-icon" />
      <div class="empty-state-title">접근 권한이 없습니다</div>
      <div class="empty-state-desc">계정 관리는 관리자 권한에서만 접근할 수 있습니다.</div>
    </div>

    <template v-else>
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">계정 관리</h1>
          <p class="page-subtitle">
            전체 {{ users.length }}명
            <span v-if="approvalPendingCount > 0"> · 승인 대기 {{ approvalPendingCount }}명</span>
          </p>
        </div>
        <button class="btn btn-secondary" @click="showInviteGuide">
          <UserPlus :size="16" :stroke-width="2" />
          초대 기능 안내
        </button>
      </div>

      <div v-if="loading" class="card empty-state">
        <div class="empty-state-title">계정 목록 불러오는 중</div>
      </div>

      <div v-else-if="users.length === 0" class="card empty-state">
        <div class="empty-state-title">등록된 계정이 없습니다</div>
      </div>

      <div v-else class="user-grid">
        <div v-for="u in users" :key="u.id" class="user-card card">
          <div class="user-card-top">
            <div class="user-avatar-lg">{{ u.name.charAt(0) || '사' }}</div>
            <div class="user-meta">
              <div class="user-meta-top">
                <span class="user-card-name">{{ u.name }}</span>
                <span class="badge" :class="statusBadgeClass(u.status)">
                  {{ statusLabel(u.status) }}
                </span>
              </div>
              <span class="user-card-email">{{ u.email }}</span>
              <span class="user-card-role">
                {{ roleLabel(u.role) }}
                <span v-if="u.id === user.id"> · 내 계정</span>
                <span v-if="u.createdAt !== '-'"> · {{ u.createdAt }} 가입</span>
              </span>
            </div>
          </div>

          <div class="user-card-footer">
            <div class="user-actions">
              <template v-if="u.status === 'pending'">
                <button
                  class="btn btn-primary btn-sm"
                  :disabled="!canManageUser(u) || pendingUserId === u.id"
                  @click="approveUser(u)"
                >
                  승인
                </button>
                <button
                  class="btn btn-ghost btn-sm btn-danger"
                  :disabled="!canManageUser(u) || pendingUserId === u.id"
                  @click="rejectUser(u)"
                >
                  반려
                </button>
              </template>

              <template v-else-if="u.status === 'rejected'">
                <button
                  class="btn btn-primary btn-sm"
                  :disabled="!canManageUser(u) || pendingUserId === u.id"
                  @click="approveUser(u)"
                >
                  승인
                </button>
              </template>

              <template v-else>
                <select
                  class="select role-select"
                  :value="u.role"
                  :disabled="!canManageUser(u) || pendingUserId === u.id"
                  @change="onRoleSelect(u, $event)"
                >
                  <option value="admin">관리자</option>
                  <option value="modifier">수정자</option>
                  <option value="viewer">열람자</option>
                </select>

                <button
                  class="btn btn-ghost btn-sm"
                  :disabled="!canManageUser(u) || pendingUserId === u.id"
                  @click="toggleStatus(u)"
                >
                  {{ u.status === 'active' ? '비활성화' : '활성화' }}
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { UserPlus, Shield } from 'lucide-vue-next'

definePageMeta({ layout: 'home' })

type UserRole = 'admin' | 'modifier' | 'viewer'
type UserStatus = 'pending' | 'active' | 'rejected' | 'inactive'

interface UserRow {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  createdAt: string
}

const supabase = useSupabaseClient()
const toast = useToast()
const { createNotification } = useNotifications()
const { user, isAdmin, profileLoaded, profileRevision } = useCurrentUser()

const users = ref<UserRow[]>([])
const loading = ref(false)
const pendingUserId = ref('')

function normalizeRole(value: unknown): UserRole {
  const role = String(value || '').toLowerCase()
  if (role === 'admin') return 'admin'
  if (role === 'modifier') return 'modifier'
  return 'viewer'
}

function normalizeStatus(value: unknown): UserStatus {
  const status = String(value || '').toLowerCase()
  if (status === 'pending') return 'pending'
  if (status === 'rejected') return 'rejected'
  if (status === 'inactive') return 'inactive'
  return 'active'
}

function formatDate(value: unknown): string {
  const raw = String(value || '')
  if (!raw) return '-'
  return raw.slice(0, 10)
}

function splitEmail(email: string): string {
  return String(email || '').split('@')[0] || ''
}

function roleLabel(role: UserRole): string {
  if (role === 'admin') return '관리자'
  if (role === 'modifier') return '수정자'
  return '열람자'
}

function roleBadgeClass(role: UserRole): string {
  if (role === 'admin') return 'badge-primary'
  if (role === 'modifier') return 'badge-info'
  return 'badge-neutral'
}

function statusLabel(status: UserStatus): string {
  if (status === 'pending') return '승인 대기'
  if (status === 'rejected') return '승인 반려'
  if (status === 'inactive') return '비활성'
  return '활성'
}

function statusBadgeClass(status: UserStatus): string {
  if (status === 'pending') return 'badge-warning'
  if (status === 'rejected') return 'badge-danger'
  if (status === 'inactive') return 'badge-danger'
  return 'badge-success'
}

const activeAdminCount = computed(() => {
  return users.value.filter((u) => u.role === 'admin' && u.status === 'active').length
})

const approvalPendingCount = computed(() => {
  return users.value.filter((u) => u.status === 'pending').length
})

function canManageUser(target: UserRow): boolean {
  if (!isAdmin.value) return false
  if (!target.id) return false
  return target.id !== user.value.id
}

async function fetchUsers() {
  if (!isAdmin.value) {
    users.value = []
    return
  }

  loading.value = true
  try {
    let rows: any[] = []

    const primary = await supabase
      .from('profiles')
      .select('id, email, full_name, role, status, created_at')
      .order('created_at', { ascending: false })

    if (!primary.error) {
      rows = (primary.data || []) as any[]
    } else {
      const code = String((primary.error as any)?.code || '').toUpperCase()
      const message = String((primary.error as any)?.message || '').toLowerCase()
      const statusMissing = code === '42703' || message.includes('status')

      if (!statusMissing) {
        throw primary.error
      }

      const fallback = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at')
        .order('created_at', { ascending: false })

      if (fallback.error) throw fallback.error
      rows = ((fallback.data || []) as any[]).map((row) => ({ ...row, status: 'active' }))
    }

    users.value = rows.map((row) => {
      const email = String(row?.email || '')
      return {
        id: String(row?.id || ''),
        name: String(row?.full_name || '').trim() || splitEmail(email),
        email,
        role: normalizeRole(row?.role),
        status: normalizeStatus(row?.status),
        createdAt: formatDate(row?.created_at),
      } satisfies UserRow
    })
  } catch (error: any) {
    console.error('Failed to fetch profiles:', error)
    toast.error(`계정 목록을 불러오지 못했습니다: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    loading.value = false
  }
}

async function updateRole(target: UserRow, nextRole: UserRole) {
  if (nextRole === target.role) return
  if (!canManageUser(target)) {
    toast.error('변경 권한이 없습니다.')
    return
  }

  if (target.role === 'admin' && target.status === 'active' && nextRole !== 'admin' && activeAdminCount.value <= 1) {
    toast.error('마지막 활성 관리자 권한은 변경할 수 없습니다.')
    return
  }

  pendingUserId.value = target.id
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ role: nextRole })
      .eq('id', target.id)

    if (error) throw error

    target.role = nextRole
    toast.success('권한이 변경되었습니다.')
    await createNotification({
      type: 'info',
      title: '계정 권한 변경',
      message: `${target.name} 계정 권한을 ${roleLabel(nextRole)}(으)로 변경했습니다.`,
      link: '/settings/users',
      payload: {
        targetUserId: target.id,
        nextRole,
      },
    })
  } catch (error: any) {
    console.error('Failed to update role:', error)
    toast.error(`권한 변경 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    pendingUserId.value = ''
  }
}

async function toggleStatus(target: UserRow) {
  if (target.status === 'pending' || target.status === 'rejected') {
    toast.info('승인 대기/반려 계정은 승인 후 상태 변경이 가능합니다.')
    return
  }

  const nextStatus: UserStatus = target.status === 'active' ? 'inactive' : 'active'
  await setStatus(target, nextStatus)
}

async function setStatus(target: UserRow, nextStatus: UserStatus) {
  if (nextStatus === target.status) return
  if (!canManageUser(target)) {
    toast.error('변경 권한이 없습니다.')
    return
  }

  if (target.role === 'admin' && target.status === 'active' && nextStatus === 'inactive' && activeAdminCount.value <= 1) {
    toast.error('마지막 활성 관리자는 비활성화할 수 없습니다.')
    return
  }

  if (target.role === 'admin' && target.status === 'active' && nextStatus === 'rejected' && activeAdminCount.value <= 1) {
    toast.error('마지막 활성 관리자 계정은 반려할 수 없습니다.')
    return
  }

  pendingUserId.value = target.id
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ status: nextStatus })
      .eq('id', target.id)

    if (error) throw error

    target.status = nextStatus
    toast.success(`계정 상태가 ${statusLabel(nextStatus)}(으)로 변경되었습니다.`)
    await createNotification({
      type: nextStatus === 'active' ? 'success' : nextStatus === 'pending' ? 'info' : 'warning',
      title: '계정 상태 변경',
      message: `${target.name} 계정 상태를 ${statusLabel(nextStatus)}(으)로 변경했습니다.`,
      link: '/settings/users',
      payload: {
        targetUserId: target.id,
        nextStatus,
      },
    })
  } catch (error: any) {
    console.error('Failed to update status:', error)
    toast.error(`상태 변경 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    pendingUserId.value = ''
  }
}

async function approveUser(target: UserRow) {
  await setStatus(target, 'active')
}

async function rejectUser(target: UserRow) {
  await setStatus(target, 'rejected')
}

function onRoleSelect(target: UserRow, event: Event) {
  const value = String((event.target as HTMLSelectElement | null)?.value || '')
  if (value !== 'admin' && value !== 'modifier' && value !== 'viewer') return
  void updateRole(target, value)
}

function showInviteGuide() {
  toast.info('초대 기능은 다음 단계에서 서버 경유 방식으로 구현 예정입니다.')
}

watch(
  () => [profileLoaded.value, profileRevision.value, isAdmin.value],
  async ([loaded, _rev, admin]) => {
    if (!loaded) return
    if (!admin) {
      users.value = []
      return
    }
    await fetchUsers()
  },
  { immediate: true },
)
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
  gap: var(--space-md);
}

.page-header-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.page-title {
  font-size: 1.25rem;
  font-weight: 760;
  color: var(--color-text);
}

.page-subtitle {
  font-size: 0.84rem;
  color: var(--color-text-muted);
}

.user-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--space-lg);
}

.user-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.user-card-top {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
}

.user-avatar-lg {
  width: 40px;
  height: 40px;
  background: #f3f6fa;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text-secondary);
  flex-shrink: 0;
  border: 1px solid rgba(223, 231, 240, 0.96);
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.user-meta-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.user-card-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
}

.user-card-email {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-card-role {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.user-card-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-top: var(--space-md);
  border-top: 1px solid var(--color-border-light);
  gap: var(--space-sm);
}

.user-actions {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  flex-wrap: wrap;
}

.role-select {
  min-width: 96px;
  width: auto;
}

.btn-danger {
  color: #dc2626;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-sm);
  }

  .user-card-footer {
    justify-content: flex-start;
  }

  .user-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
