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
          <span class="page-count badge badge-neutral">{{ users.length }}명</span>
        </div>
        <button class="btn btn-primary" @click="showInviteGuide">
          <UserPlus :size="16" :stroke-width="2" />
          초대하기 (준비중)
        </button>
      </div>

      <div class="card page-note">
        <div class="text-sm text-secondary">
          role 변경/비활성화는 실시간으로 DB(`profiles`)에 반영됩니다. 자기 계정 및 마지막 활성 관리자 보호 정책이 적용됩니다.
        </div>
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
              <span class="user-card-name">{{ u.name }}</span>
              <span class="user-card-email">{{ u.email }}</span>
            </div>
          </div>

          <div class="user-card-badges">
            <span class="badge" :class="roleBadgeClass(u.role)">
              <Shield :size="10" :stroke-width="2" />
              {{ roleLabel(u.role) }}
            </span>
            <span class="badge" :class="u.status === 'active' ? 'badge-success' : 'badge-danger'">
              {{ u.status === 'active' ? '활성' : '비활성' }}
            </span>
            <span v-if="u.id === user.id" class="badge badge-neutral">내 계정</span>
          </div>

          <div class="user-card-footer">
            <span class="user-joined text-muted">가입일: {{ u.createdAt }}</span>
            <div class="user-actions">
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
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { UserPlus, Shield } from 'lucide-vue-next'

definePageMeta({ layout: 'default' })

type UserRole = 'admin' | 'modifier' | 'viewer'
type UserStatus = 'active' | 'inactive'

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
  return String(value || '').toLowerCase() === 'inactive' ? 'inactive' : 'active'
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

const activeAdminCount = computed(() => {
  return users.value.filter((u) => u.role === 'admin' && u.status === 'active').length
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
  if (!canManageUser(target)) {
    toast.error('변경 권한이 없습니다.')
    return
  }

  const nextStatus: UserStatus = target.status === 'active' ? 'inactive' : 'active'
  if (target.role === 'admin' && target.status === 'active' && nextStatus === 'inactive' && activeAdminCount.value <= 1) {
    toast.error('마지막 활성 관리자는 비활성화할 수 없습니다.')
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
    toast.success(nextStatus === 'active' ? '계정이 활성화되었습니다.' : '계정이 비활성화되었습니다.')
    await createNotification({
      type: nextStatus === 'active' ? 'success' : 'warning',
      title: '계정 상태 변경',
      message: `${target.name} 계정을 ${nextStatus === 'active' ? '활성화' : '비활성화'}했습니다.`,
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

.page-note {
  padding: var(--space-md) var(--space-lg);
}

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
  flex-wrap: wrap;
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
  gap: var(--space-sm);
}

.user-joined {
  font-size: 0.75rem;
}

.user-actions {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
}

.role-select {
  min-width: 96px;
  width: auto;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-sm);
  }

  .user-card-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .user-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
