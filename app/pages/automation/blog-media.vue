<template>
  <div class="blog-media-page">
    <div v-if="isViewer" class="status-banner">
      <AlertTriangle :size="16" :stroke-width="2" />
      <span>열람자 권한에서는 수집을 실행할 수 없습니다.</span>
    </div>

    <div class="page-header">
      <div>
        <h1 class="page-title">블로그 미디어 수집</h1>
        <p class="page-subtitle">네이버 블로그 URL을 입력하면 이미지·동영상을 일괄 수집해 ZIP으로 다운로드합니다.</p>
      </div>
      <NuxtLink to="/automation" class="btn btn-secondary btn-sm">자동화 홈</NuxtLink>
    </div>

    <!-- URL 입력 카드 -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">
          <Link :size="18" :stroke-width="1.8" style="color: var(--color-primary)" />
          블로그 URL 입력 (최대 10개)
        </h3>
        <StatusBadge v-if="urlCount > 0" :label="`${urlCount}개`" variant="info" dot />
      </div>

      <textarea
        v-model="urlInput"
        class="url-textarea"
        placeholder="https://blog.naver.com/blogId/postNo&#10;https://blog.naver.com/blogId/postNo&#10;(한 줄에 하나씩)"
        :disabled="isInProgress || isStarting"
        rows="8"
      />

      <div class="url-meta">
        <span class="text-xs text-muted">{{ urlCount }}/10개 입력됨</span>
        <span v-if="urlCount > 10" class="text-xs text-danger">최대 10개까지 입력 가능합니다.</span>
      </div>

      <div class="actions">
        <button
          class="btn btn-primary"
          :disabled="!canStart"
          @click="handleStart"
        >
          <Download v-if="!isStarting && !isInProgress" :size="16" :stroke-width="2" />
          <Loader2 v-else :size="16" :stroke-width="2" class="spin" />
          {{ startButtonLabel }}
        </button>
        <button v-if="isDone || errorMessage" class="btn btn-ghost btn-sm" @click="handleReset">
          초기화
        </button>
        <span v-if="errorMessage" class="text-sm text-danger">{{ errorMessage }}</span>
      </div>
    </div>

    <!-- 진행 상태 카드 -->
    <div v-if="currentJob" class="card">
      <div class="card-header">
        <h3 class="card-title">진행 상태</h3>
        <StatusBadge :label="statusLabel" :variant="statusVariant" dot />
      </div>

      <div class="progress-grid">
        <div class="progress-item">
          <span class="progress-label">상태</span>
          <strong>{{ statusLabel }}</strong>
        </div>
        <div class="progress-item">
          <span class="progress-label">전체 URL</span>
          <strong>{{ currentJob.totalUrls }}개</strong>
        </div>
        <div class="progress-item">
          <span class="progress-label">성공</span>
          <strong class="text-success">{{ currentJob.successCount }}개</strong>
        </div>
        <div class="progress-item">
          <span class="progress-label">실패</span>
          <strong :class="currentJob.failCount > 0 ? 'text-danger' : ''">{{ currentJob.failCount }}개</strong>
        </div>
      </div>

      <!-- 서버 준비 중 안내 -->
      <div v-if="currentJob.status === 'pending'" class="notice-box">
        <AlertCircle :size="16" :stroke-width="2" />
        <span>서버 준비 중입니다. 처음 실행 시 최대 90초 소요될 수 있습니다.</span>
      </div>
    </div>

    <!-- 완료 결과 카드 -->
    <div v-if="isDone && currentJob" class="card">
      <div class="card-header">
        <h3 class="card-title">수집 결과</h3>
        <StatusBadge :label="resultLabel" :variant="statusVariant" dot />
      </div>

      <!-- 다운로드 버튼 -->
      <div v-if="currentJob.downloadUrl && !currentJob.isExpired" class="download-box">
        <template v-if="currentJob.downloadFiles && currentJob.downloadFiles.length > 0">
          <a
            v-for="item in currentJob.downloadFiles"
            :key="item.id"
            :href="item.url"
            class="btn btn-primary"
            download
            target="_blank"
          >
            <Download :size="16" :stroke-width="2" />
            {{ item.label }}
            <span v-if="item.fileCount" class="download-meta">({{ item.fileCount }}개)</span>
            <span v-if="item.sizeBytes" class="download-meta">{{ formatBytes(item.sizeBytes) }}</span>
          </a>
        </template>
        <a
          v-else
          :href="currentJob.downloadUrl"
          class="btn btn-primary"
          download
          target="_blank"
        >
          <Download :size="16" :stroke-width="2" />
          ZIP 다운로드 ({{ currentJob.successCount }}개 URL 수집)
        </a>
        <p class="text-xs text-muted mt-sm">
          다운로드 링크 만료: {{ formatExpiry(currentJob.expiresAt) }}
        </p>
      </div>

      <div v-else-if="currentJob.isExpired" class="notice-box notice-warn">
        <AlertTriangle :size="16" :stroke-width="2" />
        <span>다운로드 링크가 만료되었습니다. 다시 수집해 주세요.</span>
      </div>

      <div v-else-if="currentJob.status === 'failed'" class="notice-box notice-error">
        <AlertTriangle :size="16" :stroke-width="2" />
        <span>모든 URL 수집에 실패했습니다. 아래 실패 목록을 확인해 주세요.</span>
      </div>

      <!-- 실패 목록 -->
      <div v-if="currentJob.failures.length > 0" class="failure-section">
        <div class="failure-title">실패 URL ({{ currentJob.failures.length }}건)</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>URL</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in currentJob.failures" :key="f.url">
                <td class="url-cell">
                  <a :href="f.url" target="_blank" rel="noopener" class="text-link">{{ f.url }}</a>
                </td>
                <td>
                  <StatusBadge :label="failureReasonLabel(f.reason)" variant="danger" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button class="btn btn-ghost btn-sm mt-sm" @click="retryFailed">
          <RefreshCw :size="14" :stroke-width="2" />
          실패 URL만 재시도
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AlertTriangle, AlertCircle, Download, Link, Loader2, RefreshCw } from 'lucide-vue-next'
import StatusBadge from '~/components/StatusBadge.vue'
import { useBlogMediaCollector } from '~/composables/useBlogMediaCollector'

definePageMeta({ layout: 'home' })

const { isViewer, canModify } = useCurrentUser()

const {
  isStarting,
  isInProgress,
  isDone,
  currentJob,
  errorMessage,
  statusLabel,
  startJob,
  reset
} = useBlogMediaCollector()

const urlInput = ref('')

const parsedUrls = computed(() =>
  urlInput.value
    .split('\n')
    .map(u => u.trim())
    .filter(u => u.startsWith('http'))
)

const urlCount = computed(() => parsedUrls.value.length)

const canStart = computed(() =>
  canModify.value &&
  urlCount.value > 0 &&
  urlCount.value <= 10 &&
  !isStarting.value &&
  !isInProgress.value
)

const startButtonLabel = computed(() => {
  if (isStarting.value) return '시작 중...'
  if (isInProgress.value) return '수집 중...'
  return '수집 시작'
})

const statusVariant = computed(() => {
  const s = currentJob.value?.status
  if (s === 'done') return 'success'
  if (s === 'partial') return 'warning'
  if (s === 'failed') return 'danger'
  return 'info'
})

const resultLabel = computed(() => {
  const job = currentJob.value
  if (!job) return ''
  if (job.status === 'done') return `완료 (${job.successCount}/${job.totalUrls})`
  if (job.status === 'partial') return `일부 완료 (${job.successCount}/${job.totalUrls})`
  return `실패 (0/${job.totalUrls})`
})

async function handleStart() {
  await startJob(parsedUrls.value)
}

function handleReset() {
  reset()
  urlInput.value = ''
}

function retryFailed() {
  if (!currentJob.value) return
  const failedUrls = currentJob.value.failures.map(f => f.url)
  urlInput.value = failedUrls.join('\n')
  reset()
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return '-'
  const d = new Date(expiresAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatBytes(value: number): string {
  const bytes = Number(value || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)}KB`
  return `${(kb / 1024).toFixed(1)}MB`
}

function failureReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    '접근불가': '접근불가',
    '파싱실패': '파싱실패',
    '미디어_없음': '미디어 없음',
    '타임아웃': '타임아웃',
    'ZIP업로드실패': 'ZIP 업로드 실패',
    '용량초과': '용량 초과',
    '용량초과(일부제외)': '용량 초과(일부 제외)',
  }
  return map[reason] || reason
}
</script>

<style scoped>
.blog-media-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.status-banner {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--color-warning-light);
  color: #92400E;
  border: 1px solid #FDE68A;
  font-size: 0.8125rem;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.page-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 4px;
}

.page-subtitle {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.url-textarea {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-size: 0.8125rem;
  font-family: 'SF Mono', 'Fira Code', monospace;
  background: var(--color-surface);
  color: var(--color-text);
  resize: vertical;
  line-height: 1.6;
  box-sizing: border-box;
}

.url-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.url-textarea:disabled {
  background: var(--color-bg);
  color: var(--color-text-muted);
}

.url-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
}

.actions {
  margin-top: var(--space-md);
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.progress-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-md);
  margin-top: var(--space-sm);
}

.progress-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  background: #FCFCFD;
}

.progress-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.notice-box {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: var(--space-md);
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: #EFF6FF;
  color: #1D4ED8;
  border: 1px solid #BFDBFE;
  font-size: 0.8125rem;
}

.notice-box.notice-warn {
  background: var(--color-warning-light);
  color: #92400E;
  border-color: #FDE68A;
}

.notice-box.notice-error {
  background: #FEF2F2;
  color: #991B1B;
  border-color: #FECACA;
}

.download-box {
  margin-top: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.download-meta {
  font-size: 0.75rem;
  opacity: 0.92;
}

.failure-section {
  margin-top: var(--space-lg);
}

.failure-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: var(--space-sm);
}

.url-cell {
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-link {
  color: var(--color-primary);
  text-decoration: underline;
  font-size: 0.75rem;
}

.text-success { color: var(--color-success); }
.text-danger { color: var(--color-danger); }
.mt-sm { margin-top: var(--space-sm); }

@keyframes spin {
  to { transform: rotate(360deg); }
}
.spin {
  animation: spin 1s linear infinite;
}
</style>
