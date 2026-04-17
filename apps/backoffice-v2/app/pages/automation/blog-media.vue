<template>
  <div class="blog-media-page">
    <div v-if="isViewer" class="status-banner">
      <AlertTriangle :size="16" :stroke-width="2" />
      <span>열람자 권한에서는 수집을 실행할 수 없습니다.</span>
    </div>

    <div class="page-header">
      <div>
        <h1 class="page-title">블로그 미디어 수집</h1>
        <p class="page-subtitle">네이버 블로그 URL을 넣으면 이미지와 영상을 순차 저장합니다.</p>
      </div>
      <NuxtLink to="/automation" class="btn btn-secondary btn-sm">자동화 홈</NuxtLink>
    </div>

    <!-- URL 입력 카드 -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">
            <Link :size="18" :stroke-width="1.8" style="color: var(--color-primary)" />
            블로그 URL
          </h3>
          <p class="card-copy">한 줄에 하나씩 넣으면 순서대로 수집합니다.</p>
        </div>
        <span v-if="urlCount > 0" class="card-meta">{{ urlCount }}개</span>
      </div>

      <textarea
        v-model="urlInput"
        class="url-textarea"
        placeholder="https://blog.naver.com/blogId/postNo&#10;https://blog.naver.com/blogId/postNo&#10;(한 줄에 하나씩)"
        :disabled="isRunning"
        rows="8"
      />

      <div class="url-meta">
        <span class="text-xs text-muted">{{ urlCount }}개 입력됨</span>
      </div>

      <div class="actions">
        <button
          class="btn btn-primary"
          :disabled="!canStart"
          @click="handleStart"
        >
          <Loader2 v-if="isRunning" :size="16" :stroke-width="2" class="spin" />
          <Download v-else :size="16" :stroke-width="2" />
          {{ startButtonLabel }}
        </button>
        <button v-if="isDone || errorMessage" class="btn btn-ghost btn-sm" @click="handleReset">
          초기화
        </button>
        <span v-if="errorMessage" class="text-sm text-danger">{{ errorMessage }}</span>
      </div>
    </div>

    <!-- 진행 상태 카드 -->
    <div v-if="isRunning || isDone" class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">진행 상태</h3>
          <p class="card-copy">수집 순서와 실패 URL을 바로 확인합니다.</p>
        </div>
        <span class="card-meta" :class="statusMetaTone">{{ statusLabel }}</span>
      </div>

      <div class="progress-grid">
        <div class="progress-item">
          <span class="progress-label">전체 URL</span>
          <strong>{{ progress.totalUrls }}개</strong>
        </div>
        <div class="progress-item">
          <span class="progress-label">처리 완료</span>
          <strong>{{ progress.processedCount }}개</strong>
        </div>
        <div class="progress-item">
          <span class="progress-label">성공 (자동다운로드됨)</span>
          <strong class="text-success">{{ progress.successCount }}개</strong>
        </div>
        <div class="progress-item">
          <span class="progress-label">실패</span>
          <strong :class="progress.failCount > 0 ? 'text-danger' : ''">{{ progress.failCount }}개</strong>
        </div>
      </div>

      <!-- 처리 중 안내창 -->
      <div v-if="isRunning" class="notice-box">
        <Loader2 :size="16" :stroke-width="2" class="spin" style="margin-right: 4px;" />
        <span>현재 <b>{{ progress.currentUrl }}</b> 처리 및 자동 다운로드 대기 중...</span>
      </div>

      <!-- 완료 결과 카드 안내 -->
      <div v-if="isDone" class="notice-box" style="background: #ECFDF5; color: #065F46; border-color: #A7F3D0;">
        <Download :size="16" :stroke-width="2" />
        <span>모든 URL 수집 작업이 종료되었습니다. 브라우저의 다운로드 폴더를 확인해주세요.</span>
      </div>

      <!-- 실패 목록 -->
      <div v-if="progress.failures.length > 0" class="failure-section">
        <div class="failure-title">실패 내역 ({{ progress.failures.length }}건)</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>URL</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in progress.failures" :key="f.url">
                <td class="url-cell">
                  <a :href="f.url" target="_blank" rel="noopener" class="text-link">{{ f.url }}</a>
                </td>
                <td>
                  <span class="failure-badge">{{ failureReasonLabel(f.reason) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button v-if="isDone" class="btn btn-ghost btn-sm mt-sm" @click="retryFailed">
          <RefreshCw :size="14" :stroke-width="2" />
          실패 URL만 재시도
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AlertTriangle, Download, Link, Loader2, RefreshCw } from 'lucide-vue-next'
import { useBlogMediaCollector } from '~/composables/useBlogMediaCollector'

definePageMeta({ layout: 'home' })

const { isViewer, canModify } = useCurrentUser()

const {
  isRunning,
  isDone,
  isPolling,
  progress,
  errorMessage,
  statusLabel,
  statusVariant,
  startBatch,
  reset
} = useBlogMediaCollector()

const toast = useToast()
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
  !isRunning.value
)

const startButtonLabel = computed(() => {
  if (isRunning.value) return '수집 및 다운로드 진행 중...'
  if (isDone.value) return '새로 수집 시작'
  return '순차 수집 및 자동 다운로드 시작'
})

const statusMetaTone = computed(() => {
  if (statusVariant.value === 'danger') return 'danger'
  if (statusVariant.value === 'warning') return 'warning'
  if (statusVariant.value === 'success') return 'success'
  return ''
})


async function handleStart() {
  await startBatch(parsedUrls.value)
}

function handleReset() {
  reset()
  urlInput.value = ''
}

function retryFailed() {
  const failedUrls = progress.value.failures.map(f => f.url)
  urlInput.value = failedUrls.join('\n')
  reset()
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
  padding: 12px 14px;
  border-radius: 14px;
  background: #fff8e8;
  color: #92400E;
  border: 1px solid #f6d58d;
  font-size: 0.8125rem;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.page-title {
  font-size: 1.25rem;
  font-weight: 760;
  color: var(--color-text);
  margin-bottom: 4px;
}

.page-subtitle {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.card-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.card-copy {
  margin-top: 6px;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.card-meta {
  flex-shrink: 0;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(223, 231, 240, 0.96);
  background: #f8fafc;
  color: var(--color-text-secondary);
  font-size: 0.78rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.card-meta.success {
  background: #edf9f2;
  border-color: #bde3c7;
  color: #166534;
}

.card-meta.warning {
  background: #fff8e8;
  border-color: #f6d58d;
  color: #92400E;
}

.card-meta.danger {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
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
  border: 1px solid rgba(223, 231, 240, 0.96);
  border-radius: 16px;
  padding: var(--space-md);
  background: #fbfcfe;
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
  padding: 12px 14px;
  border-radius: 14px;
  background: #f5f8fd;
  color: #1D4ED8;
  border: 1px solid rgba(191, 219, 254, 0.86);
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

.failure-section {
  margin-top: var(--space-lg);
}

.failure-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: var(--space-sm);
}

.failure-badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  font-size: 0.75rem;
  font-weight: 700;
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

@media (max-width: 768px) {
  .page-header,
  .card-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .progress-grid {
    grid-template-columns: 1fr;
  }
}
</style>
