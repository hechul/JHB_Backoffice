<template>
  <div class="settings-page">
    <div v-if="!profileLoaded" class="card empty-state">
      <div class="empty-state-title">권한 확인 중</div>
    </div>

    <div v-else-if="!isAdmin" class="card empty-state">
      <div class="empty-state-title">접근 권한이 없습니다</div>
    </div>

    <template v-else>
      <div class="settings-header">
        <div>
          <h1 class="settings-title">근무 기준 설정</h1>
        </div>
      </div>

      <div v-if="tableMissing" class="card notice-error">
        `attendance_settings` 테이블 또는 최신 컬럼이 없어 설정을 저장할 수 없습니다.
        `docs/sql/2026-03-10_attendance_phase2.sql` 또는 `docs/sql/2026-03-10_attendance_onoff_early_leave_patch.sql` 실행이 필요합니다.
      </div>

      <div class="card form-card">
        <section class="settings-group">
          <div class="settings-group-head">
            <h2>출퇴근 기준</h2>
          </div>
          <div class="form-grid">
            <label class="field">
              <span>기본 출근 시간</span>
              <input v-model="form.work_start_time" type="time" class="input" :disabled="saving || tableMissing" />
            </label>

            <label class="field">
              <span>기본 퇴근 시간</span>
              <input v-model="form.work_end_time" type="time" class="input" :disabled="saving || tableMissing" />
            </label>
          </div>
        </section>

        <section class="settings-group">
          <div class="settings-group-head">
            <h2>판정 기준</h2>
          </div>
          <div class="form-grid">
            <label class="field">
              <span>지각 허용 분</span>
              <input v-model.number="form.late_grace_minutes" type="number" min="0" class="input" :disabled="saving || tableMissing" />
            </label>

            <label class="field">
              <span>조퇴 기준 분</span>
              <input v-model.number="form.early_leave_grace_minutes" type="number" min="0" class="input" :disabled="saving || tableMissing" />
            </label>
          </div>
        </section>

        <section class="settings-group">
          <div class="settings-group-head">
            <h2>근무시간 기준</h2>
          </div>
          <div class="form-grid">
            <label class="field">
              <span>점심 차감 분</span>
              <input v-model.number="form.lunch_break_minutes" type="number" min="0" class="input" :disabled="saving || tableMissing" />
            </label>

            <label class="field">
              <span>기준 근무시간(분)</span>
              <input v-model.number="form.standard_work_minutes" type="number" min="0" class="input" :disabled="saving || tableMissing" />
            </label>
          </div>
        </section>

        <div class="form-actions">
          <button class="btn btn-primary" :disabled="saving || tableMissing" @click="saveSettings">저장</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AttendanceSettings } from '~/composables/useAttendance'

definePageMeta({ layout: 'attendance' })

const supabase = useSupabaseClient()
const toast = useToast()
const { isAdmin, profileLoaded } = useCurrentUser()
const { DEFAULT_ATTENDANCE_SETTINGS, normalizeAttendanceSettings } = useAttendance()

const tableMissing = ref(false)
const saving = ref(false)
const form = ref<AttendanceSettings>(normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS))

function isMissingTableError(error: any) {
  const code = String(error?.code || '').toUpperCase()
  const msg = String(error?.message || '').toLowerCase()
  return code === '42P01' || msg.includes('attendance_settings')
}

function isMissingSettingsColumnError(error: any) {
  const code = String(error?.code || '').toUpperCase()
  const msg = String(error?.message || '').toLowerCase()
  return code === '42703' || msg.includes('early_leave_grace_minutes')
}

async function fetchSettings() {
  const query = supabase
    .from('attendance_settings')
    .select('id, work_start_time, work_end_time, late_grace_minutes, early_leave_grace_minutes, lunch_break_minutes, standard_work_minutes, created_at, updated_at')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data, error } = await query

  if (error) {
    if (isMissingTableError(error)) {
      tableMissing.value = true
      form.value = normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS)
      return
    }
    if (isMissingSettingsColumnError(error)) {
      tableMissing.value = true
      form.value = normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS)
      return
    }
    throw error
  }

  tableMissing.value = false
  form.value = normalizeAttendanceSettings((data as any) || DEFAULT_ATTENDANCE_SETTINGS)
}

async function saveSettings() {
  saving.value = true
  try {
    const payload = normalizeAttendanceSettings(form.value)
    const { error } = await supabase
      .from('attendance_settings')
      .upsert({
        id: payload.id || 1,
        work_start_time: payload.work_start_time,
        work_end_time: payload.work_end_time,
        late_grace_minutes: payload.late_grace_minutes,
        early_leave_grace_minutes: payload.early_leave_grace_minutes,
        lunch_break_minutes: payload.lunch_break_minutes,
        standard_work_minutes: payload.standard_work_minutes,
      })

    if (error) throw error
    toast.success('근무 기준이 저장되었습니다.')
    await fetchSettings()
  } catch (error: any) {
    console.error('Failed to save attendance settings:', error)
    toast.error(`근무 기준 저장 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

watch(
  () => [profileLoaded.value, isAdmin.value],
  async ([loaded, admin]) => {
    if (!loaded || !admin) return
    await fetchSettings()
  },
  { immediate: true },
)
</script>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.settings-title {
  font-size: 1.125rem;
  font-weight: 700;
}

.settings-subtitle {
  margin-top: 4px;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.notice-error {
  font-size: 0.875rem;
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.form-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings-group + .settings-group {
  padding-top: 4px;
  border-top: 1px dashed rgba(148, 163, 184, 0.22);
}

.settings-group-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-group-head h2 {
  font-size: 1rem;
  font-weight: 800;
}

.settings-group-head p {
  color: var(--color-text-secondary);
  font-size: 0.88rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field span {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}

.field-help {
  color: var(--color-text-secondary);
  font-size: 0.8rem;
  line-height: 1.45;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-actions :deep(.btn) {
    width: 100%;
  }
}
</style>
