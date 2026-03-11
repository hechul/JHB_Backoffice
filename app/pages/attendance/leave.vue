<template>
  <div class="leave-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">휴가 · 반차 신청</h1>
      </div>
      <input v-model="selectedMonth" type="month" class="input month-input" />
    </div>

    <div v-if="leaveTableMissing" class="card notice-neutral">
      `leave_requests` 테이블이 없어 휴가/반차 기능은 사용할 수 없습니다.
      `docs/sql/2026-03-10_attendance_phase2.sql` 실행이 필요합니다.
    </div>

    <template v-else>
      <div class="summary-grid">
        <div v-for="item in leaveSummaryCards" :key="item.label" class="card summary-card">
          <div class="summary-head">
            <span class="summary-label">{{ item.label }}</span>
            <div class="summary-icon-wrap" :class="item.tone">
              <component :is="item.icon" :size="16" :stroke-width="1.9" />
            </div>
          </div>
          <strong class="summary-value">{{ item.value }}</strong>
        </div>
      </div>

      <div class="card form-card">
        <div class="section-head">
          <h2>신청하기</h2>
        </div>

        <div class="form-grid">
          <label class="field">
            <span>유형</span>
            <select v-model="leaveForm.leave_type" class="input select-input" :disabled="savingLeave">
              <option value="annual">연차</option>
              <option value="half_am">오전 반차</option>
              <option value="half_pm">오후 반차</option>
              <option value="sick">병가</option>
              <option value="official">공가</option>
              <option value="other">기타</option>
            </select>
          </label>

          <label class="field">
            <span>시작일</span>
            <input v-model="leaveForm.start_date" type="date" class="input" :disabled="savingLeave" />
          </label>

          <label class="field">
            <span>종료일</span>
            <input v-model="leaveForm.end_date" type="date" class="input" :disabled="savingLeave || isHalfDayType(leaveForm.leave_type)" />
          </label>

          <label class="field field-wide">
            <span>사유</span>
            <textarea v-model.trim="leaveForm.reason" class="input textarea-input" rows="3" :disabled="savingLeave" />
          </label>
        </div>

        <div class="form-actions">
          <button class="btn btn-primary" :disabled="savingLeave" @click="submitLeaveRequest">신청하기</button>
        </div>
      </div>

      <div class="card table-card">
        <div class="section-head">
          <h2>신청 내역</h2>
        </div>
        <div v-if="visibleLeaveRequests.length === 0" class="table-empty">해당 월 신청 내역이 없습니다.</div>
        <div v-else class="table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>유형</th>
                <th>기간</th>
                <th>상태</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleLeaveRequests" :key="row.id">
                <td>{{ getLeaveTypeLabel(row.leave_type) }}</td>
                <td>{{ row.start_date }}<span v-if="row.end_date !== row.start_date"> ~ {{ row.end_date }}</span></td>
                <td>
                  <span class="status-chip" :class="getLeaveStatusClass(row.status)">{{ getLeaveStatusLabel(row.status) }}</span>
                </td>
                <td>{{ row.reason || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { CheckCircle2, Clock3, Send, XCircle } from 'lucide-vue-next'
import type { LeaveRequest, LeaveType } from '~/composables/useAttendance'

definePageMeta({ layout: 'attendance' })

const supabase = useSupabaseClient()
const toast = useToast()
const { user, profileLoaded } = useCurrentUser()
const { getKstDateKey, getKstMonthKey, getMonthRange, getLeaveTypeLabel, getLeaveStatusLabel, getLeaveStatusClass } = useAttendance()

const selectedMonth = ref(getKstMonthKey())
const leaveRequests = ref<LeaveRequest[]>([])
const leaveTableMissing = ref(false)
const savingLeave = ref(false)

const leaveForm = reactive({
  leave_type: 'annual' as LeaveType,
  start_date: getKstDateKey(),
  end_date: getKstDateKey(),
  reason: '',
})

const visibleLeaveRequests = computed(() => {
  const { start, end } = getMonthRange(selectedMonth.value)
  return [...leaveRequests.value]
    .filter((row) => row.start_date <= end && row.end_date >= start)
    .sort((a, b) => `${b.start_date}${b.created_at}`.localeCompare(`${a.start_date}${a.created_at}`))
})

const leaveSummaryCards = computed(() => {
  const visible = visibleLeaveRequests.value
  const countBy = (status: LeaveRequest['status']) => visible.filter((row) => row.status === status).length
  return [
    { label: '신청 건수', value: `${visible.length}건`, tone: 'summary-tone-slate', icon: Send },
    { label: '승인 대기', value: `${countBy('pending')}건`, tone: 'summary-tone-amber', icon: Clock3 },
    { label: '승인 완료', value: `${countBy('approved')}건`, tone: 'summary-tone-green', icon: CheckCircle2 },
    { label: '반려', value: `${countBy('rejected')}건`, tone: 'summary-tone-red', icon: XCircle },
  ]
})

function isMissingTableError(error: any) {
  const code = String(error?.code || '').toUpperCase()
  const msg = String(error?.message || '').toLowerCase()
  return code === '42P01' || msg.includes('leave_requests')
}

function isHalfDayType(type: LeaveType) {
  return type === 'half_am' || type === 'half_pm'
}

async function fetchLeaveRequests() {
  if (!user.value.id) return
  const { start, end } = getMonthRange(selectedMonth.value)
  const { data, error } = await supabase
    .from('leave_requests')
    .select('id, user_id, leave_type, start_date, end_date, status, reason, approved_by, approved_at, created_at, updated_at')
    .eq('user_id', user.value.id)
    .lte('start_date', end)
    .gte('end_date', start)
    .order('start_date', { ascending: false })
    .order('id', { ascending: false })

  if (error) {
    if (isMissingTableError(error)) {
      leaveTableMissing.value = true
      leaveRequests.value = []
      return
    }
    throw error
  }

  leaveTableMissing.value = false
  leaveRequests.value = (data || []) as LeaveRequest[]
}

async function submitLeaveRequest() {
  if (leaveTableMissing.value || !user.value.id) return
  if (!leaveForm.start_date || !leaveForm.end_date) {
    toast.error('휴가 기간을 입력해야 합니다.')
    return
  }
  if (isHalfDayType(leaveForm.leave_type)) {
    leaveForm.end_date = leaveForm.start_date
  }
  if (leaveForm.end_date < leaveForm.start_date) {
    toast.error('종료일은 시작일보다 빠를 수 없습니다.')
    return
  }

  savingLeave.value = true
  try {
    const { error } = await supabase
      .from('leave_requests')
      .insert({
        user_id: user.value.id,
        leave_type: leaveForm.leave_type,
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        reason: leaveForm.reason || null,
      })

    if (error) throw error
    toast.success('휴가 신청이 저장되었습니다.')
    leaveForm.reason = ''
    await fetchLeaveRequests()
  } catch (error: any) {
    console.error('Failed to submit leave request:', error)
    toast.error(`휴가 신청 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    savingLeave.value = false
  }
}

watch(
  () => leaveForm.leave_type,
  (type) => {
    if (isHalfDayType(type)) leaveForm.end_date = leaveForm.start_date
  },
)

watch(
  () => leaveForm.start_date,
  (value) => {
    if (isHalfDayType(leaveForm.leave_type)) leaveForm.end_date = value
  },
)

watch(
  () => [profileLoaded.value, user.value.id],
  async ([loaded, uid]) => {
    if (!loaded || !uid) return
    try {
      await fetchLeaveRequests()
    } catch (error: any) {
      console.error('Failed to fetch leave requests:', error)
      toast.error(`휴가 신청 내역 조회 실패: ${error?.message || '알 수 없는 오류'}`)
    }
  },
  { immediate: true },
)

watch(selectedMonth, async () => {
  if (!profileLoaded.value || !user.value.id) return
  try {
    await fetchLeaveRequests()
  } catch (error: any) {
    console.error('Failed to fetch leave requests:', error)
    toast.error(`휴가 신청 내역 조회 실패: ${error?.message || '알 수 없는 오류'}`)
  }
})
</script>

<style scoped>
.leave-page {
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
  font-size: 1.18rem;
  font-weight: 700;
}

.page-subtitle {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 0.94rem;
}

.notice-neutral {
  color: var(--color-text-secondary);
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.form-card,
.table-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-md);
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
}

.summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.summary-label {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.summary-value {
  font-size: 1.3rem;
  font-weight: 800;
}

.summary-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.summary-tone-slate {
  color: #475569;
  background: rgba(148, 163, 184, 0.12);
}

.summary-tone-amber {
  color: #b45309;
  background: rgba(245, 158, 11, 0.14);
}

.summary-tone-green {
  color: #047857;
  background: rgba(16, 185, 129, 0.14);
}

.summary-tone-red {
  color: #b91c1c;
  background: rgba(239, 68, 68, 0.14);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-md);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field span {
  font-size: 0.9rem;
  font-weight: 600;
}

.field-wide {
  grid-column: 1 / -1;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}

.textarea-input {
  min-height: 100px;
  resize: vertical;
}

.table-empty {
  color: var(--color-text-secondary);
}

@media (max-width: 768px) {
  .page-header,
  .section-head {
    flex-direction: column;
    align-items: stretch;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
