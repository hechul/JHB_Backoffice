<template>
  <div class="blog-media-page">
    <div v-if="isViewer" class="status-banner">
      <AlertTriangle :size="16" :stroke-width="2" />
      <span>열람자 권한에서는 수집을 실행할 수 없습니다.</span>
    </div>

    <div class="page-header">
      <div>
        <h1 class="page-title">블로그 미디어 수집 (최적화 모드)</h1>
        <p class="page-subtitle">네이버 블로그 URL을 입력하면 원본 고화질 이미지·동영상을 1건씩 순차 수집 후 자동 다운로드합니다. <br>(서버 용량 최적화를 위해 다운로드가 완료된 파일은 즉시 삭제됩니다.)</p>
      </div>
      <NuxtLink to="/automation" class="btn btn-secondary btn-sm">자동화 홈</NuxtLink>
    </div>

    <!-- URL 입력 카드 -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">
          <Link :size="18" :stroke-width="1.8" style="color: var(--color-primary)" />
          블로그 URL 입력
        </h3>
        <StatusBadge v-if="urlCount > 0" :label="`${urlCount}개`" variant="info" dot />
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
        <button v-if="isRunning" class="btn btn-secondary" @click="handleCancel">
          중단
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
        <h3 class="card-title">진행 상태</h3>
        <StatusBadge :label="statusLabel" :variant="statusVariant" dot />
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
                  <StatusBadge :label="failureReasonLabel(f.reason)" variant="danger" />
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
import StatusBadge from '~/components/StatusBadge.vue'
import { useBlogMediaCollector } from '~/composables/useBlogMediaCollector'

definePageMeta({ layout: 'home' })

const URL_INPUT_STORAGE_KEY = 'jh_blog_media_url_input_v1'

const { isViewer, canModify } = useCurrentUser()

const {
  isRunning,
  isDone,
  progress,
  errorMessage,
  statusLabel,
  statusVariant,
  startBatch,
  cancelBatch,
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
  !isRunning.value
)

const startButtonLabel = computed(() => {
  if (isRunning.value) return '수집 및 다운로드 진행 중...'
  if (isDone.value) return '새로 수집 시작'
  return '순차 수집 및 자동 다운로드 시작'
})

onMounted(() => {
  if (!import.meta.client) return

  try {
    const stored = localStorage.getItem(URL_INPUT_STORAGE_KEY)
    if (stored) {
      urlInput.value = stored
    }
  } catch { /* noop */ }
})

watch(urlInput, (value) => {
  if (!import.meta.client) return

  try {
    const normalized = String(value || '')
    if (normalized.trim()) {
      localStorage.setItem(URL_INPUT_STORAGE_KEY, normalized)
      return
    }
    localStorage.removeItem(URL_INPUT_STORAGE_KEY)
  } catch { /* noop */ }
})

async function handleStart() {
  await startBatch(parsedUrls.value)
}

async function handleCancel() {
  await cancelBatch()
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
