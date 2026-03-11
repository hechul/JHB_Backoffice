<template>
  <div class="leave-approvals-page">
    <div v-if="!profileLoaded" class="card empty-state">
      <div class="empty-state-title">권한 확인 중</div>
    </div>

    <div v-else-if="!isAdmin" class="card empty-state">
      <div class="empty-state-title">접근 권한이 없습니다</div>
      <div class="empty-state-desc">휴가 승인은 관리자 계정에서만 확인할 수 있습니다.</div>
    </div>

    <template v-else>
      <div class="page-header">
        <div>
          <h1 class="page-title">휴가 승인</h1>
        </div>
        <div class="page-actions">
          <input v-model="selectedMonth" type="month" class="input month-input" />
          <input v-model.trim="searchText" type="text" class="input search-input" placeholder="이름/아이디 검색" />
        </div>
      </div>

      <div v-if="leaveTableMissing" class="card notice-neutral">
        `leave_requests` 테이블이 없어 휴가 승인 기능은 사용할 수 없습니다.
        `docs/sql/2026-03-10_attendance_phase2.sql` 실행이 필요합니다.
      </div>

      <template v-else>
        <div class="summary-grid">
          <div v-for="item in summaryCards" :key="item.label" class="card summary-card" :class="item.tone">
            <span class="summary-label">{{ item.label }}</span>
            <strong class="summary-value">{{ item.value }}</strong>
          </div>
        </div>

        <div class="card table-card">
          <div class="section-head">
            <h2>신청 목록</h2>
            <div class="status-filter-row">
              <button
                v-for="filter in statusFilters"
                :key="filter.value"
                type="button"
                class="status-filter-chip"
                :class="{ active: selectedStatusFilter === filter.value }"
                @click="selectedStatusFilter = filter.value"
              >
                {{ filter.label }}
              </button>
            </div>
          </div>

          <div v-if="visibleRequests.length === 0" class="table-empty">해당 조건의 휴가 신청이 없습니다.</div>
          <div v-else class="approval-card-list">
            <article v-for="row in visibleRequests" :key="row.id" class="approval-card">
              <div class="approval-card-head">
                <div>
                  <div class="approval-user-name">{{ row.user_name }}</div>
                  <div class="approval-user-id">{{ row.user_login_id }}</div>
                </div>
                <span class="status-chip" :class="getLeaveStatusClass(row.status)">{{ getLeaveStatusLabel(row.status) }}</span>
              </div>

              <div class="approval-metric-grid">
                <div class="approval-metric">
                  <span class="approval-metric-label">유형</span>
                  <strong class="approval-metric-value">{{ getLeaveTypeLabel(row.leave_type) }}</strong>
                </div>
                <div class="approval-metric">
                  <span class="approval-metric-label">기간</span>
                  <strong class="approval-metric-value">
                    {{ row.start_date }}<span v-if="row.end_date !== row.start_date"> ~ {{ row.end_date }}</span>
                  </strong>
                </div>
              </div>

              <div class="approval-reason-box">
                <span class="approval-reason-label">사유</span>
                <div class="approval-reason-value">{{ row.reason || '-' }}</div>
              </div>

              <div class="approval-actions">
                <button class="btn btn-primary btn-sm" :disabled="savingId === row.id || row.status === 'approved'" @click="reviewRequest(row, 'approved')">승인</button>
                <button class="btn btn-ghost btn-sm btn-danger" :disabled="savingId === row.id || row.status === 'rejected'" @click="reviewRequest(row, 'rejected')">반려</button>
              </div>
            </article>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { LeaveRequest } from '~/composables/useAttendance'

definePageMeta({ layout: 'attendance' })

type ApprovalRow = LeaveRequest & {
  user_name: string
  user_email: string
  user_login_id: string
}

const supabase = useSupabaseClient()
const toast = useToast()
const { user, isAdmin, profileLoaded } = useCurrentUser()
const { getKstMonthKey, getMonthRange, getLeaveTypeLabel, getLeaveStatusLabel, getLeaveStatusClass } = useAttendance()

const selectedMonth = ref(getKstMonthKey())
const searchText = ref('')
const selectedStatusFilter = ref<'all' | 'pending' | 'approved' | 'rejected'>('pending')
const requests = ref<ApprovalRow[]>([])
const leaveTableMissing = ref(false)
const savingId = ref<number | null>(null)

const statusFilters = [
  { label: '대기', value: 'pending' },
  { label: '승인', value: 'approved' },
  { label: '반려', value: 'rejected' },
  { label: '전체', value: 'all' },
] as const

const visibleRequests = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  const { start, end } = getMonthRange(selectedMonth.value)
  return requests.value
    .filter((row) => row.start_date <= end && row.end_date >= start)
    .filter((row) => selectedStatusFilter.value === 'all' || row.status === selectedStatusFilter.value)
    .filter((row) => !q || [row.user_name, row.user_login_id, row.reason, getLeaveTypeLabel(row.leave_type)]
      .some((value) => String(value || '').toLowerCase().includes(q)))
    .sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (a.status !== 'pending' && b.status === 'pending') return 1
      return `${b.start_date}${b.created_at}`.localeCompare(`${a.start_date}${a.created_at}`)
    })
})

const summaryCards = computed(() => {
  const visible = requests.value.filter((row) => {
    const { start, end } = getMonthRange(selectedMonth.value)
    return row.start_date <= end && row.end_date >= start
  })
  const countBy = (status: LeaveRequest['status']) => visible.filter((row) => row.status === status).length
  return [
    { label: '전체 신청', value: `${visible.length}건`, tone: 'tone-slate' },
    { label: '승인 대기', value: `${countBy('pending')}건`, tone: 'tone-amber' },
    { label: '승인 완료', value: `${countBy('approved')}건`, tone: 'tone-green' },
    { label: '반려', value: `${countBy('rejected')}건`, tone: 'tone-red' },
  ]
})

function splitEmailLoginId(email: string) {
  const [idPart = ''] = String(email || '').split('@')
  return idPart || '-'
}

function isMissingTableError(error: any) {
  const code = String(error?.code || '').toUpperCase()
  const msg = String(error?.message || '').toLowerCase()
  return code === '42P01' || msg.includes('leave_requests')
}

async function fetchRequests() {
  const { start, end } = getMonthRange(selectedMonth.value)
  const { data, error } = await supabase
    .from('leave_requests')
    .select('id, user_id, leave_type, start_date, end_date, status, reason, approved_by, approved_at, created_at, updated_at')
    .lte('start_date', end)
    .gte('end_date', start)
    .order('start_date', { ascending: false })
    .order('id', { ascending: false })

  if (error) {
    if (isMissingTableError(error)) {
      leaveTableMissing.value = true
      requests.value = []
      return
    }
    throw error
  }

  leaveTableMissing.value = false
  const rows = (data || []) as LeaveRequest[]
  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))]
  const profileMap = new Map<string, { full_name: string | null, email: string | null }>()

  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds)

    if (profileError) throw profileError

    for (const profile of profiles || []) {
      profileMap.set(String((profile as any).id || ''), {
        full_name: String((profile as any).full_name || '') || null,
        email: String((profile as any).email || '') || null,
      })
    }
  }

  requests.value = rows.map((row) => {
    const profile = profileMap.get(row.user_id)
    const email = String(profile?.email || '')
    return {
      ...row,
      user_name: String(profile?.full_name || splitEmailLoginId(email) || '-'),
      user_email: email,
      user_login_id: splitEmailLoginId(email),
    } as ApprovalRow
  })
}

async function reviewRequest(row: ApprovalRow, status: 'approved' | 'rejected') {
  if (!user.value.id) return
  savingId.value = row.id
  try {
    const { error } = await supabase
      .from('leave_requests')
      .update({
        status,
        approved_by: user.value.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    if (error) throw error
    toast.success(status === 'approved' ? '휴가 신청을 승인했습니다.' : '휴가 신청을 반려했습니다.')
    await fetchRequests()
  } catch (error: any) {
    console.error('Failed to review leave request:', error)
    toast.error(`휴가 처리 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    savingId.value = null
  }
}

watch(
  () => [profileLoaded.value, isAdmin.value],
  async ([loaded, admin]) => {
    if (!loaded || !admin) return
    try {
      await fetchRequests()
    } catch (error: any) {
      console.error('Failed to fetch leave approvals:', error)
      toast.error(`휴가 승인 목록 조회 실패: ${error?.message || '알 수 없는 오류'}`)
    }
  },
  { immediate: true },
)

watch(selectedMonth, async () => {
  if (!profileLoaded.value || !isAdmin.value) return
  try {
    await fetchRequests()
  } catch (error: any) {
    console.error('Failed to fetch leave approvals:', error)
    toast.error(`휴가 승인 목록 조회 실패: ${error?.message || '알 수 없는 오류'}`)
  }
})
</script>

<style scoped>
.leave-approvals-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.page-header,
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.page-title {
  font-size: 1.8rem;
  font-weight: 700;
}

.page-subtitle {
  margin-top: 4px;
  color: var(--color-text-muted);
}

.page-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.month-input,
.search-input {
  min-width: 180px;
}

.summary-grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.approval-card-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
}

.approval-card {
  padding: var(--space-lg);
  border-radius: var(--radius-xl);
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.88);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.approval-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.approval-user-name {
  font-size: 1rem;
  font-weight: 800;
}

.approval-user-id {
  margin-top: 4px;
  font-size: 0.86rem;
  color: var(--color-text-muted);
}

.approval-metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.approval-metric {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.14);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.approval-metric-label,
.approval-reason-label {
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.approval-metric-value {
  font-size: 0.94rem;
  font-weight: 800;
}

.approval-reason-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px dashed rgba(148, 163, 184, 0.22);
}

.approval-reason-value {
  line-height: 1.5;
  color: var(--color-text);
}

.approval-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-lg);
  border-radius: var(--radius-xl);
}

.summary-label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.summary-value {
  font-size: 1.55rem;
  font-weight: 700;
  color: var(--color-text);
}

.tone-slate { background: rgba(148, 163, 184, 0.12); }
.tone-amber { background: rgba(245, 158, 11, 0.12); }
.tone-green { background: rgba(34, 197, 94, 0.12); }
.tone-red { background: rgba(239, 68, 68, 0.12); }

.table-card,
.empty-state,
.notice-neutral {
  padding: var(--space-lg);
}

.status-filter-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.status-filter-chip {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  transition: background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
}

.status-filter-chip.active {
  background: rgba(37, 99, 235, 0.12);
  border-color: rgba(37, 99, 235, 0.22);
  color: #2563eb;
}

.table-empty,
.empty-state-desc {
  color: var(--color-text-muted);
}

.empty-state-title {
  font-size: 1.05rem;
  font-weight: 700;
}

@media (max-width: 900px) {
  .page-header,
  .section-head {
    flex-direction: column;
    align-items: stretch;
  }

  .page-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .month-input,
  .search-input {
    min-width: 0;
  }

  .approval-card-list,
  .approval-metric-grid {
    grid-template-columns: 1fr;
  }
}
</style>
