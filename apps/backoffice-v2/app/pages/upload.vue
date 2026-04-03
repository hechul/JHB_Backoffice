<template>
  <div class="upload-page">
    <div v-if="isViewer" class="status-banner">
      <AlertTriangle :size="16" :stroke-width="2" />
      <span>열람자 권한에서는 업로드를 실행할 수 없습니다.</span>
    </div>

    <div v-if="selectedMonth === 'all'" class="status-banner warning">
      <Info :size="16" :stroke-width="2" />
      <span>월별 업로드를 위해 헤더에서 특정 월을 선택해 주세요. 전체 기간에서는 업로드를 실행할 수 없습니다.</span>
    </div>




    <div class="upload-grid">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">
            <FileSpreadsheet :size="18" :stroke-width="1.8" style="color: var(--color-primary)" />
            체험단 엑셀 업로드
          </h3>
          <div class="upload-header-actions">
            <button class="btn btn-ghost btn-sm" @click="downloadTemplate">
              <Download :size="14" :stroke-width="2" />
              체험단 양식
            </button>
            <StatusBadge v-if="sourceFile" label="파일 선택됨" variant="success" dot />
          </div>
        </div>

        <div
          class="drop-zone"
          :class="{ 'drag-over': sourceDragOver }"
          @dragover.prevent="sourceDragOver = true"
          @dragleave="sourceDragOver = false"
          @drop.prevent="handleSourceDrop"
          @click="triggerSourceInput"
        >
          <Upload :size="32" :stroke-width="1.5" class="drop-zone-icon" />
          <span v-if="!sourceFile" class="text-sm text-secondary">.xlsx/.xls 파일 1개를 드래그하거나 클릭하여 선택</span>
          <div v-else class="file-selected">
            <span class="file-name">{{ sourceFile.name }}</span>
            <span class="file-size">{{ formatSize(sourceFile.size) }}</span>
            <button class="btn btn-ghost btn-sm" @click.stop="clearSourceFile">
              <X :size="14" :stroke-width="2" />
            </button>
          </div>
        </div>
        <input ref="sourceInput" type="file" accept=".xlsx,.xls" hidden @change="onSourceSelect" />

        <p class="text-xs text-muted mt-sm">
          웨이프로젝트 체험단 시트 1개만 포함된 엑셀을 업로드하세요.
          주문 데이터는 <strong>고객 관리 &gt; 주문 동기화</strong> 메뉴에서 불러옵니다.
        </p>

        <div v-if="sourceFile" class="sheet-map">
          <StatusBadge
            :label="`체험단 시트: ${isSourceParsing ? '탐지 중...' : (detectedExperienceSheetName || '미탐지')}`"
            :variant="isSourceParsing ? 'info' : (detectedExperienceSheetName ? 'success' : 'danger')"
          />
        </div>

        <div v-if="influencerValidation" class="validation-block">
          <div class="validation-title">체험단 시트 검증</div>
          <div class="validation-preview" :class="{ error: influencerValidation.missing.length > 0 }">
            <AlertTriangle v-if="influencerValidation.missing.length > 0" :size="14" :stroke-width="2" />
            <CheckCircle v-else :size="14" :stroke-width="2" style="color: var(--color-success)" />
            <span>필수 컬럼 {{ influencerValidation.total }}개 중 <strong>{{ influencerValidation.total - influencerValidation.missing.length }}개</strong> 확인됨</span>
          </div>
          <div v-if="influencerValidation.missing.length" class="missing-columns">
            <span class="missing-columns-label">누락 컬럼:</span>
            <div class="missing-columns-list">
              <span v-for="column in influencerValidation.missing" :key="`influencer-${column}`" class="missing-column-chip">{{ column }}</span>
            </div>
          </div>
        </div>
      </div>

    </div>

    <div v-if="!isViewer" class="upload-actions">
      <button
        class="btn btn-primary btn-lg"
        :disabled="!canUpload || isUploading"
        :class="{ 'btn-loading': isUploading }"
        @click="startUpload"
      >
        <Upload :size="18" :stroke-width="2" />
        업로드 시작
      </button>
      <span v-if="uploadBlockReason" class="text-sm text-danger">{{ uploadBlockReason }}</span>
    </div>

    <div v-if="isUploading" class="card">
      <div class="card-header">
        <h3 class="card-title">업로드 진행 중...</h3>
        <span class="text-sm text-secondary">{{ uploadProgress }}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-bar-fill" :style="{ width: uploadProgress + '%' }"></div>
      </div>
    </div>

    <div v-if="hasResult" class="card">
      <div class="card-header">
        <h3 class="card-title">업로드 결과</h3>
        <StatusBadge label="완료" variant="success" dot />
      </div>
      <div class="result-timeline">
        <div v-for="(entry, i) in uploadResults" :key="i" class="timeline-item">
          <div class="timeline-dot" :class="entry.type"></div>
          <div class="timeline-content">
            <span class="timeline-time">{{ entry.time }}</span>
            <span class="timeline-desc">{{ entry.description }}</span>
          </div>
          <span class="timeline-count">{{ entry.count }}건</span>
        </div>
      </div>
      <div class="next-step-banner">
        <div class="next-step-text">
          <ArrowRight :size="16" :stroke-width="2" />
          <span>데이터 업로드가 완료되었습니다. 필터링을 시작해보세요.</span>
        </div>
        <NuxtLink to="/filter" class="btn btn-primary btn-sm">분석 시작하기</NuxtLink>
      </div>
    </div>

    <div v-if="hasResult && needsMapping && mappingFailedItems.length > 0" class="card">
      <div class="card-header">
        <h3 class="card-title">
          <AlertTriangle :size="16" :stroke-width="2" style="color: var(--color-warning)" />
          새 상품 연결 필요 (체험단)
        </h3>
        <div class="mapping-header-actions">
          <StatusBadge :label="`남은 ${remainingMappingCount}건`" variant="warning" />
          <StatusBadge :label="`완료 ${mappedCount}건`" variant="success" />
        </div>
      </div>

      <div class="alert alert-warning mb-lg">
        <AlertTriangle :size="16" :stroke-width="2" />
        <span>체험단 데이터의 상품/옵션 조합 중 등록되지 않은 항목입니다. 기존 상품 검색으로 연결하거나 새로 등록해 주세요.</span>
      </div>

      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>원본 상품명</th>
              <th>옵션</th>
              <th>연결할 상품</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in mappingFailedItems" :key="`${item.originalName}::${item.originalOption || '-'}`">
              <td class="font-medium">{{ item.originalName }}</td>
              <td>{{ item.originalOption || '-' }}</td>
              <td>
                <div class="mapping-search-wrap">
                  <SearchInput v-model="item.searchQuery" placeholder="상품 검색..." width="260px" />
                  <div v-if="item.searchQuery.trim() && suggestionsFor(item).length > 0" class="mapping-suggestions">
                    <button
                      v-for="option in suggestionsFor(item)"
                      :key="`${item.originalName}-${option.product_id}`"
                      class="mapping-suggestion-item"
                      @click="selectSuggestion(item, option)"
                    >
                      {{ productDisplayName(option) }}
                    </button>
                  </div>
                </div>
                <span v-if="item.mappedProduct" class="text-xs text-success">선택됨: {{ item.mappedProduct }}</span>
              </td>
              <td>
                <div v-if="!isViewer" class="mapping-row-actions">
                  <button class="btn btn-primary btn-sm" :disabled="!item.mappedProductId || !!item.isProcessing" @click="connectItem(item)">
                    연결
                  </button>
                  <button class="btn btn-secondary btn-sm" :disabled="!!item.isProcessing || !!item.mappedProductId" @click="registerAsNew(item)">
                    {{ item.isProcessing ? '등록 중...' : '새로 등록' }}
                  </button>
                </div>
                <span v-else class="text-sm text-muted">관리자만 가능</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="!hasResult && !isUploading" class="card">
      <EmptyState
        title="업로드 이력이 없습니다"
        description="체험단 엑셀을 업로드하면 결과가 여기에 표시됩니다."
        :icon="FileUp"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle,
  AlertTriangle,
  FileUp,
  ArrowRight,
  Download,
  Info,
  Terminal,
  Play,
  RefreshCw,
  Loader2,
  Clock3,
} from 'lucide-vue-next'
import {
  parseExcelWorkbook,
  findSheetByPreferredNames,
  detectSheetByColumns,
  detectLegacyExperienceSheet,
  validateColumns,
  preprocessExperiences,
  extractExperienceRows,
  normalizeExperienceHeader,
  type ParsedWorkbookSheet,
  type ColumnValidation,
} from '~/composables/useExcelParser'
import { matchesSearchQuery } from '~/composables/useTextSearch'
import {
  buildProductLookup,
  normalizeForMatch,
  resolveMappedProduct,
  type ProductCatalogItem,
} from '../../shared/productCatalog'
import * as XLSX from 'xlsx'

interface MappingItem {
  originalName: string
  originalOption: string
  searchQuery: string
  mappedProduct: string
  mappedProductId: string
  isProcessing?: boolean
}

interface ExperienceInsertRow {
  upload_batch_id: string
  target_month: string
  campaign_id: number
  mission_product_name: string
  mapped_product_id: string | null
  option_info: string | null
  receiver_name: string
  naver_id: string
  purchase_date: string
}

interface ExperienceDbRow {
  id: number
  upload_batch_id: string
  target_month: string
  campaign_id: number
  mission_product_name: string
  mapped_product_id: string | null
  option_info: string | null
  receiver_name: string
  naver_id: string
  purchase_date: string
  unmatch_reason: string | null
}

interface MappingApplyResult {
  experienceUpdated: number
}

const supabase = useSupabaseClient()
const toast = useToast()
const { user, isViewer, profileLoaded, profileRevision } = useCurrentUser()
const { createNotification } = useNotifications()
const { selectedMonth, refreshMonths } = useAnalysisPeriod()
const { getWorkflow, setUploadResult, setMappingPending, setUnmappedProducts } = useMonthlyWorkflow()

// 체험단 파일 업로드 상태
const sourceFile = ref<File | null>(null)
const influencerValidation = ref<ColumnValidation | null>(null)
const sourceDragOver = ref(false)
const detectedExperienceSheetName = ref('')
const inferredCampaignName = ref('')
const uploadProgress = ref(0)
const sourceInput = ref<HTMLInputElement | null>(null)

const parsedExpRows = ref<Record<string, string>[]>([])
const monthSyncSeq = ref(0)
const isSourceParsing = ref(false)

type UploadState = 'empty' | 'uploading' | 'uploaded' | 'mapping_required'

// 이 페이지의 핵심 상태:
// - uploaded: 체험단 데이터 적재 완료
// - mapping_required: 체험단 상품명 중 products와 연결되지 않은 항목이 남아 있음
const uploadState = ref<UploadState>('empty')
const mappingFailedItems = ref<MappingItem[]>([])
const uploadResultTimestamp = ref('')

const uploadResultStats = ref({ orderNew: 0, orderExcluded: 0, expInserted: 0 })

// 화면 표시용 파생 상태
const isUploading = computed(() => uploadState.value === 'uploading')
const hasResult = computed(() => uploadState.value === 'uploaded' || uploadState.value === 'mapping_required')
const needsMapping = computed(() => uploadState.value === 'mapping_required')
const mappedCount = computed(() => mappingFailedItems.value.filter((item) => !!item.mappedProductId).length)
const remainingMappingCount = computed(() => Math.max(0, mappingFailedItems.value.length - mappedCount.value))

type NaverSyncMode = 'dry-run' | 'live'
type SyncLogLevel = 'info' | 'success' | 'warning' | 'error'

// 아래 타입들은 주문 동기화 UI에서 쓰는 응답/로그 구조
interface NaverSyncLogEntry {
  time: string
  level: SyncLogLevel
  message: string
}

interface NaverSyncSummaryEntry {
  label: string
  value: string
  tone?: 'info' | 'success' | 'warning' | 'danger'
}

interface NaverSyncSummary {
  dryRun?: boolean
  sourceChannel?: string
  sourceAccountKey?: string
  requestedFrom?: string
  requestedTo?: string
  windowCount?: number
  changedCount?: number
  detailCount?: number
  rawEventCount?: number
  rawLineCount?: number
  projectedCount?: number
  excludedCount?: number
  deletedCount?: number
  unresolvedCount?: number
  mappingRowCount?: number
}

interface NaverSyncResponse {
  ok: boolean
  dryRun: boolean
  start: string
  end: string
  accountKey: string
  runType: string
  requestedByAccountId: string | null
  limitCount: number
  detailBatchSize: number
  scriptPath: string
  exitCode: number | null
  signal: string | null
  durationMs: number
  summary: NaverSyncSummary | null
  stdout: string
  stderr: string
}

const NAVER_SYNC_PRESETS = {
  '2025-12': { start: '2025-12-01', end: '2025-12-31' },
  '2026-01': { start: '2026-01-01', end: '2026-01-31' },
  '2026-02': { start: '2026-02-01', end: '2026-02-28' },
  '2025-12-2026-02': { start: '2025-12-01', end: '2026-02-28' },
} as const

const naverSyncEndpoint = '/api/commerce/naver/sync'
const NAVER_SYNC_DEFAULT_START = '2025-12-01'
const NAVER_SYNC_DEFAULT_END = '2026-02-28'

const naverSyncStartDate = ref(NAVER_SYNC_DEFAULT_START)
const naverSyncEndDate = ref(NAVER_SYNC_DEFAULT_END)
const naverSyncMode = ref<NaverSyncMode>('dry-run')
const naverSyncProgress = ref(0)
const naverSyncProgressLabel = ref('대기 중')
const naverSyncLogs = ref<NaverSyncLogEntry[]>([])
const naverSyncSummary = ref<Record<string, any> | null>(null)
const naverSyncError = ref('')
const naverSyncLastRunAt = ref('')
let naverSyncPulseTimer: ReturnType<typeof setInterval> | null = null
const isNaverSyncRunning = ref(false)

// 주문 동기화 실행 가능 여부와 결과 요약
const hasNaverSyncResult = computed(() => Boolean(naverSyncSummary.value) || naverSyncLogs.value.length > 0 || Boolean(naverSyncError.value))

const naverSyncRangeLabel = computed(() => {
  const start = naverSyncStartDate.value || '-'
  const end = naverSyncEndDate.value || '-'
  return `${start} ~ ${end}`
})

const naverSyncBlockReason = computed(() => {
  if (isViewer.value) return '열람자 권한에서는 네이버 동기화를 실행할 수 없습니다.'
  if (isNaverSyncRunning.value) return '동기화가 진행 중입니다.'
  if (!naverSyncStartDate.value || !naverSyncEndDate.value) return '시작일과 종료일을 모두 입력해 주세요.'
  if (naverSyncStartDate.value > naverSyncEndDate.value) return '시작일은 종료일보다 빠르거나 같아야 합니다.'
  return ''
})

const canRunNaverSync = computed(() => naverSyncBlockReason.value === '')

const naverSyncSummaryEntries = computed<NaverSyncSummaryEntry[]>(() => {
  const source = naverSyncSummary.value
  if (!source || typeof source !== 'object') return []

  const valueOf = (keys: string[]) => {
    for (const key of keys) {
      const value = (source as Record<string, any>)[key]
      if (value !== undefined && value !== null && `${value}`.trim() !== '') return value
    }
    return undefined
  }

  const candidates: Array<[string, string[], NaverSyncSummaryEntry['tone']?]> = [
    ['기간', ['rangeLabel', 'range', 'period', 'syncRange'], 'info'],
    ['윈도우', ['windows', 'windowCount', 'batchCount'], 'info'],
    ['변경 주문', ['changed', 'changedCount', 'changedItems', 'changedOrderCount'], 'success'],
    ['상세 주문', ['detail', 'detailCount', 'productOrderCount', 'detailItems'], 'success'],
    ['적재', ['projected', 'projectedCount', 'upserted', 'appliedCount', 'purchaseCount'], 'success'],
    ['미매핑', ['unresolved', 'unresolvedCount', 'needsReviewCount'], 'warning'],
    ['제외', ['excluded', 'excludedCount', 'skippedCount'], 'warning'],
    ['실행 시간', ['duration', 'elapsed', 'elapsedMs', 'durationMs'], 'info'],
  ]

  const rows = candidates
    .map(([label, keys, tone]) => {
      const value = valueOf(keys)
      if (value === undefined) return null
      return { label, value: String(value), tone }
    })
    .filter((entry): entry is NaverSyncSummaryEntry => entry !== null)

  if (rows.length > 0) return rows

  return Object.entries(source)
    .filter(([, value]) => value !== undefined && value !== null && typeof value !== 'object')
    .slice(0, 8)
    .map(([label, value]) => ({ label, value: String(value) }))
})

const uploadStateVariant = computed(() => {
  const map = { empty: 'neutral', uploading: 'info', uploaded: 'success', mapping_required: 'warning' } as const
  return map[uploadState.value]
})

const uploadStepLabel = computed(() => {
  const map = { empty: '업로드 전', uploading: '업로드 진행 중', uploaded: '업로드 완료', mapping_required: '매핑 필요' } as const
  return map[uploadState.value]
})

const uploadStepGuide = computed(() => {
  if (selectedMonth.value === 'all') return '전체 기간에서는 업로드를 실행할 수 없습니다. 특정 월을 선택해 주세요.'
  const map = {
    empty: '체험단 시트가 포함된 엑셀 파일을 선택한 뒤 업로드를 시작하세요.',
    uploading: '파일 검증과 적재를 진행하고 있습니다. 완료될 때까지 잠시만 기다려주세요.',
    uploaded: '업로드가 완료되었습니다. 다음 단계로 필터링을 실행하세요.',
    mapping_required: '상품 매핑이 필요한 항목이 남아 있습니다. 연결을 마친 뒤 필터링을 진행하세요.',
  } as const
  return map[uploadState.value]
})

const canUpload = computed(() => {
  if (selectedMonth.value === 'all') return false
  if (!sourceFile.value) return false
  if (isSourceParsing.value) return false
  if (!detectedExperienceSheetName.value) return false
  if (!influencerValidation.value || influencerValidation.value.missing.length > 0) return false
  if (parsedExpRows.value.length === 0) return false
  return true
})

const uploadBlockReason = computed(() => {
  if (selectedMonth.value === 'all') return '특정 월을 선택한 뒤 업로드를 진행해 주세요.'
  if (!sourceFile.value) return '체험단 엑셀(.xlsx/.xls) 파일을 선택해 주세요.'
  if (isSourceParsing.value) return '시트/컬럼을 분석 중입니다. 잠시만 기다려 주세요.'
  if (!detectedExperienceSheetName.value) return '체험단 시트를 찾지 못했습니다. 시트명(웨이프로젝트) 또는 컬럼 구성을 확인해 주세요.'
  if (influencerValidation.value && influencerValidation.value.missing.length > 0) return '체험단 시트에 필수 컬럼이 누락되어 있습니다.'
  if (parsedExpRows.value.length === 0) return '체험단 시트 데이터가 비어 있습니다.'
  return ''
})

// 체험단 시트 탐지/검증용 기준값
const influencerRequiredColumns = ['미션상품명', '옵션정보', '수취인명', '아이디', '구매인증일', '캠페인명']
const experienceSheetAliases = ['웨이프로젝트', '웨이 프로젝트', '체험단']
const unmappedOptionDelimiter = '__OPT__'

const DB_BATCH_SIZE = 50
const DB_REQUEST_TIMEOUT_MS = 20000
const DB_REQUEST_MAX_RETRIES = 3

// Supabase 요청 재시도용 보조 함수들
function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isRetryableError(error: unknown): boolean {
  const code = String((error as any)?.code || '').trim()
  const message = String((error as any)?.message || '').toLowerCase()

  if (!message && !code) return false
  if (/timeout|timed out|abort|network|fetch|gateway|temporarily|unavailable|connection/i.test(message)) return true
  if (/^5\d\d$/.test(code)) return true
  if (code === '57014') return true
  return false
}

async function runQueryWithRetry<T>(
  label: string,
  queryFn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= DB_REQUEST_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DB_REQUEST_TIMEOUT_MS)

    try {
      const result = await queryFn(controller.signal)
      const responseError = (result as any)?.error
      if (responseError && isRetryableError(responseError) && attempt < DB_REQUEST_MAX_RETRIES) {
        lastError = responseError
        console.warn(`[upload] ${label} 응답 오류로 재시도 (${attempt}/${DB_REQUEST_MAX_RETRIES})`, responseError)
        await sleep(400 * attempt)
        continue
      }
      return result
    } catch (error) {
      lastError = error
      console.warn(`[upload] ${label} 실패 (${attempt}/${DB_REQUEST_MAX_RETRIES})`, error)
      if (attempt < DB_REQUEST_MAX_RETRIES && isRetryableError(error)) {
        await sleep(400 * attempt)
        continue
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error(`${label} 요청이 실패했습니다.`)
}

// 대량 insert/update를 안전하게 쪼개기 위한 chunk 함수
function chunkArray<T>(items: T[], chunkSize = DB_BATCH_SIZE): T[][] {
  if (items.length === 0) return []
  const size = Math.max(1, Math.floor(chunkSize))
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

// option_info가 빈 값인 경우까지 함께 다루기 위한 공통 조건 함수
function applyOptionFilter(query: any, optionValue: string) {
  if (optionValue) {
    return query.eq('option_info', optionValue)
  }
  return query.or('option_info.is.null,option_info.eq.')
}

// 업로드 실패 시 롤백할 수 있도록 기존 experiences 스냅샷을 읽어둔다.
async function fetchCampaignExperiencesSnapshot(month: string, campaignId: number): Promise<ExperienceDbRow[]> {
  const { data, error } = await runQueryWithRetry(
    '업로드 롤백용 기존 체험단 스냅샷 조회',
    (signal) =>
      supabase
        .from('experiences')
        .select('id, upload_batch_id, target_month, campaign_id, mission_product_name, mapped_product_id, option_info, receiver_name, naver_id, purchase_date, unmatch_reason')
        .eq('target_month', month)
        .eq('campaign_id', campaignId)
        .abortSignal(signal),
  )
  if (error) throw error
  return (data || []) as ExperienceDbRow[]
}

async function clearCampaignExperiences(month: string, campaignId: number) {
  const { error } = await runQueryWithRetry(
    '체험단 캠페인 데이터 정리',
    (signal) =>
      supabase
        .from('experiences')
        .delete()
        .eq('target_month', month)
        .eq('campaign_id', campaignId)
        .abortSignal(signal),
  )
  if (error) throw error
}

async function restoreCampaignExperiencesSnapshot(rows: ExperienceDbRow[]) {
  const restoreRows = rows.map((row) => ({
    id: row.id,
    upload_batch_id: row.upload_batch_id,
    target_month: row.target_month,
    campaign_id: row.campaign_id,
    mission_product_name: row.mission_product_name,
    mapped_product_id: row.mapped_product_id,
    option_info: row.option_info,
    receiver_name: row.receiver_name,
    naver_id: row.naver_id,
    purchase_date: row.purchase_date,
    unmatch_reason: row.unmatch_reason,
  }))

  for (const batch of chunkArray(restoreRows)) {
    const { error } = await runQueryWithRetry(
      '업로드 롤백용 기존 체험단 복원',
      (signal) =>
        supabase
          .from('experiences')
          .insert(batch)
          .abortSignal(signal),
    )
    if (error) throw error
  }
}

// 상품 카탈로그 (Supabase 실 데이터)
// 체험단 행의 상품명을 products와 연결하려면 현재 상품 목록을 먼저 읽어야 한다.
const productCatalog = ref<ProductCatalogItem[]>([])

async function loadProductCatalog() {
  const withOption = await supabase
    .from('products')
    .select('product_id, product_name, option_name')
    .is('deleted_at', null)
    .order('product_name')

  if (!withOption.error && withOption.data) {
    productCatalog.value = (withOption.data as any[]).map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      option_name: row.option_name || null,
    }))
    return
  }

  // 하위 호환: option_name 컬럼이 아직 없는 스키마
  const legacy = await supabase
    .from('products')
    .select('product_id, product_name')
    .is('deleted_at', null)
    .order('product_name')
  if (legacy.data) {
    productCatalog.value = (legacy.data as any[]).map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      option_name: null,
    }))
  }
}
onMounted(loadProductCatalog)

// 업로드/동기화 시간 표시 포맷
function formatUploadTimestamp(value: string): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    return String(value).replace('T', ' ').slice(0, 16)
  }
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function isValidDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())
}

function appendNaverSyncLog(message: string, level: SyncLogLevel = 'info', time = '') {
  const normalized = String(message || '').trim()
  if (!normalized) return
  naverSyncLogs.value.push({
    time: time || formatUploadTimestamp(new Date().toISOString()),
    level,
    message: normalized,
  })
}

// sync.post.ts에서 받은 stdout/stderr를 화면 로그로 번역한다.
function buildNaverSyncLogs(stdout: string, stderr: string): NaverSyncLogEntry[] {
  const nextLogs: NaverSyncLogEntry[] = []
  const normalizeStdout = (() => {
    const trimmed = String(stdout || '').trimEnd()
    const braceIndex = trimmed.lastIndexOf('\n{')
    if (braceIndex >= 0) {
      return trimmed.slice(0, braceIndex).trimEnd()
    }
    return trimmed
  })()
  const appendLines = (text: string, level: SyncLogLevel) => {
    String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        if (line.startsWith('{') && line.endsWith('}')) return
        nextLogs.push({
          time: formatUploadTimestamp(new Date().toISOString()),
          level,
          message: line,
        })
      })
  }

  appendLines(normalizeStdout, 'info')
  appendLines(stderr, 'error')
  return nextLogs.slice(-20)
}

// 주문 동기화 UI 상태 초기화/가짜 진행률 표시용 함수
function resetNaverSyncResult(mode: NaverSyncMode) {
  naverSyncMode.value = mode
  naverSyncError.value = ''
  naverSyncSummary.value = null
  naverSyncLogs.value = []
  naverSyncLastRunAt.value = ''
  naverSyncProgress.value = 0
  naverSyncProgressLabel.value = mode === 'dry-run' ? '드라이런 시작 준비' : '실시간 동기화 시작 준비'
}

function startNaverSyncPulse() {
  stopNaverSyncPulse()
  naverSyncProgressLabel.value = '동기화 요청 처리 중'
  naverSyncProgress.value = 12
  naverSyncPulseTimer = setInterval(() => {
    naverSyncProgress.value = Math.min(92, naverSyncProgress.value + 7)
  }, 1200)
}

function stopNaverSyncPulse(finalProgress = 100) {
  if (naverSyncPulseTimer) {
    clearInterval(naverSyncPulseTimer)
    naverSyncPulseTimer = null
  }
  naverSyncProgress.value = finalProgress
}

function applyNaverSyncPreset(preset: keyof typeof NAVER_SYNC_PRESETS) {
  const selected = NAVER_SYNC_PRESETS[preset]
  if (!selected) return
  naverSyncStartDate.value = selected.start
  naverSyncEndDate.value = selected.end
}

// 동기화 범위를 포함하는 월 목록 계산
function expandMonthRange(start: string, end: string): string[] {
  if (!isValidDateInput(start) || !isValidDateInput(end) || start > end) return []
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  const months: string[] = []

  while (cursor.getTime() <= endDate.getTime()) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return months
}

function pickLatestTimestamp(a: string, b: string): string {
  if (!a) return b
  if (!b) return a
  const da = new Date(a)
  const db = new Date(b)
  if (Number.isNaN(da.getTime())) return b
  if (Number.isNaN(db.getTime())) return a
  return da.getTime() >= db.getTime() ? a : b
}

async function fetchMonthUploadMeta(month: string): Promise<{ expCount: number; latestUploadAt: string }> {
  const { count: expCount, error: expError } = await supabase
    .from('experiences')
    .select('id', { count: 'exact', head: true })
    .eq('target_month', month)

  if (expError) throw expError

  let latestUploadAt = ''
  const { data: latestExpRows, error: latestExpError } = await supabase
    .from('experiences')
    .select('created_at')
    .eq('target_month', month)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!latestExpError || latestExpError.code !== '42703') {
    const expAt = String((latestExpRows as any[] | null)?.[0]?.created_at || '')
    latestUploadAt = pickLatestTimestamp(latestUploadAt, expAt)
  }

  return {
    expCount: Number(expCount || 0),
    latestUploadAt: formatUploadTimestamp(latestUploadAt),
  }
}

// 동일 체험단 행이 중복 삽입되지 않도록 dedup key를 만든다.
function buildExperienceDedupKey(row: ExperienceInsertRow): string {
  const campaign = String(row.campaign_id || '')
  const product = normalizeForMatch(row.mission_product_name || '')
  const option = normalizeForMatch(row.option_info || '')
  const naverId = normalizeForMatch(row.naver_id || '')
  const receiver = normalizeForMatch(row.receiver_name || '')
  const date = String(row.purchase_date || '')

  if (naverId) {
    return ['with_id', campaign, naverId, product, date].join('::')
  }
  return ['no_id', campaign, receiver, product, date, option].join('::')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function resetSourceFileState() {
  isSourceParsing.value = false
  sourceFile.value = null
  influencerValidation.value = null
  parsedExpRows.value = []
  detectedExperienceSheetName.value = ''
  inferredCampaignName.value = ''
}

function serializeUnmappedItem(name: string, option: string): string {
  return option ? `${name}${unmappedOptionDelimiter}${option}` : name
}

function deserializeUnmappedItem(serialized: string): { name: string; option: string } {
  const value = String(serialized || '')
  const idx = value.indexOf(unmappedOptionDelimiter)
  if (idx < 0) return { name: value, option: '' }
  return {
    name: value.slice(0, idx),
    option: value.slice(idx + unmappedOptionDelimiter.length),
  }
}

function productDisplayName(product: ProductCatalogItem): string {
  return product.option_name ? `${product.product_name} / ${product.option_name}` : product.product_name
}

// 업로드된 엑셀 안에서 체험단 시트를 찾는 우선순위:
// 1) 시트명
// 2) 필수 컬럼
// 3) 레거시 패턴
function pickExperienceSheet(sheets: ParsedWorkbookSheet[], excludedNames: string[]): ParsedWorkbookSheet | null {
  return (
    findSheetByPreferredNames(sheets, experienceSheetAliases, excludedNames)
    || detectSheetByColumns(sheets, influencerRequiredColumns, excludedNames)
    || detectLegacyExperienceSheet(sheets, excludedNames)
  )
}

// 파일 선택 시 체험단 시트 파싱
// 이 단계는 아직 DB에 쓰지 않고, "이 파일이 체험단 업로드 가능한지"만 확인한다.
async function processSourceFile(file: File) {
  if (/^~\$/.test(file.name)) {
    toast.error('엑셀 임시 잠금 파일(~$)입니다. 원본 파일을 선택해 주세요.')
    return
  }

  resetSourceFileState()
  sourceFile.value = file
  isSourceParsing.value = true

  try {
    const sheets = await parseExcelWorkbook(file)
    const experienceSheet = pickExperienceSheet(sheets, [])
    detectedExperienceSheetName.value = experienceSheet?.name || ''

    if (experienceSheet) {
      const extractedRows = extractExperienceRows(experienceSheet)
      parsedExpRows.value = extractedRows
      const extractedHeaders = Array.from(
        extractedRows.reduce((set, row) => {
          Object.keys(row || {}).forEach((key) => {
            if (key) set.add(key)
          })
          return set
        }, new Set<string>()),
      )
      const normalizedHeaders = Array.from(new Set(extractedHeaders.map((h) => normalizeExperienceHeader(h) || h)))
      influencerValidation.value = validateColumns(normalizedHeaders, influencerRequiredColumns)

      const exp = preprocessExperiences(extractedRows)
      inferredCampaignName.value = exp.map((row) => row.campaign_name.trim()).find((name) => Boolean(name)) || ''
    } else {
      influencerValidation.value = { total: influencerRequiredColumns.length, matched: [], missing: [...influencerRequiredColumns] }
    }
  } catch {
    toast.error('엑셀 파일을 읽을 수 없습니다.')
    resetSourceFileState()
  } finally {
    isSourceParsing.value = false
  }
}

function clearSourceFile() { resetSourceFileState() }
function triggerSourceInput() { if (isViewer.value || selectedMonth.value === 'all') return; sourceInput.value?.click() }

function onSourceSelect(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) processSourceFile(f)
}

function handleSourceDrop(e: DragEvent) {
  if (isViewer.value || selectedMonth.value === 'all') return
  sourceDragOver.value = false
  const f = e.dataTransfer?.files[0]
  if (f) processSourceFile(f)
}

// 체험단 상품명 -> products 연결 UI 보조 함수
function suggestionsFor(item: MappingItem) {
  const q = item.searchQuery.trim()
  if (!q) return []
  return productCatalog.value
    .filter((p) => {
      const display = productDisplayName(p)
      return matchesSearchQuery(q, display, p.product_name, p.option_name || '')
    })
    .slice(0, 5)
}

function selectSuggestion(item: MappingItem, option: ProductCatalogItem) {
  item.searchQuery = productDisplayName(option)
  item.mappedProduct = item.searchQuery
  item.mappedProductId = option.product_id
}

function syncMappingState() {
  const pending = remainingMappingCount.value
  const unresolved = mappingFailedItems.value
    .filter((item) => !item.mappedProductId)
    .map((item) => serializeUnmappedItem(item.originalName, item.originalOption))

  if (pending === 0 && uploadState.value === 'mapping_required') {
    uploadState.value = 'uploaded'
    setMappingPending(selectedMonth.value, 0)
    setUnmappedProducts(selectedMonth.value, [])
    toast.success('상품 매핑이 완료되었습니다.')
  } else {
    setMappingPending(selectedMonth.value, pending)
    setUnmappedProducts(selectedMonth.value, unresolved)
  }
}

function removeMappingItem(item: MappingItem) {
  mappingFailedItems.value = mappingFailedItems.value.filter((row) => row !== item)
}

async function applyMappedProductToDataset(item: MappingItem, mappedProductId: string): Promise<MappingApplyResult> {
  if (!mappedProductId || selectedMonth.value === 'all') {
    return { experienceUpdated: 0 }
  }

  const matchedProduct = productCatalog.value.find((p) => p.product_id === mappedProductId)
  const normalizedProductName = matchedProduct?.product_name || item.originalName
  const normalizedOption = matchedProduct?.option_name || null

  const experiencePayload: Record<string, any> = {
    mapped_product_id: mappedProductId,
    mission_product_name: normalizedProductName,
  }
  if (normalizedOption) experiencePayload.option_info = normalizedOption

  let expQuery = supabase
    .from('experiences')
    .update(experiencePayload)
    .eq('target_month', selectedMonth.value)
    .eq('mission_product_name', item.originalName)
  expQuery = applyOptionFilter(expQuery, item.originalOption)
  const { data: expData, error: expError } = await expQuery.select('id')
  if (expError) {
    console.error('Failed to apply mapped product to experiences:', expError)
    throw new Error(`체험단 DB 반영 실패: ${expError.message}`)
  }

  const result = {
    experienceUpdated: Array.isArray(expData) ? expData.length : 0,
  }
  if (result.experienceUpdated === 0) {
    throw new Error('적용 대상이 없어 반영되지 않았습니다. 원본 상품명/옵션 조건을 확인해 주세요.')
  }
  return result
}

async function connectItem(item: MappingItem) {
  if (!item.mappedProductId || item.isProcessing) return
  item.isProcessing = true
  try {
    const applied = await applyMappedProductToDataset(item, item.mappedProductId)
    toast.success(`"${item.mappedProduct}" 연결 완료 (체험단 ${applied.experienceUpdated}건)`)
    removeMappingItem(item)
    syncMappingState()
  } catch (err: any) {
    toast.error(`상품 연결 실패: ${err.message || '알 수 없는 오류'}`)
    // 항목을 제거하지 않고 유지 → 사용자가 재시도 가능
  } finally {
    item.isProcessing = false
  }
}

async function registerAsNew(item: MappingItem) {
  if (item.isProcessing || item.mappedProductId) return
  const name = item.originalName.trim()
  if (!name) return
  item.isProcessing = true
  const newId = `P-${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`
  const payload: Record<string, any> = {
    product_id: newId,
    product_name: name,
    pet_type: 'BOTH',
    option_name: item.originalOption || null,
  }

  try {
    let { error } = await supabase.from('products').insert(payload)
    if (error && error.code === '42703') {
      // 하위 호환: option_name 컬럼이 아직 없는 스키마
      const fallback = await supabase
        .from('products')
        .insert({ product_id: newId, product_name: name, pet_type: 'BOTH' })
      error = fallback.error
    }

    if (!error) {
      const added: ProductCatalogItem = {
        product_id: newId,
        product_name: name,
        option_name: item.originalOption || null,
      }
      productCatalog.value.unshift(added)
      item.mappedProduct = productDisplayName(added)
      item.mappedProductId = newId
      item.searchQuery = item.mappedProduct
      try {
        const applied = await applyMappedProductToDataset(item, newId)
        removeMappingItem(item)
        syncMappingState()
        toast.success(`"${item.mappedProduct}" 상품이 등록되었습니다. (체험단 ${applied.experienceUpdated}건 반영)`)
      } catch (err: any) {
        // 상품은 등록됨, 매핑 반영만 실패
        toast.error(`상품은 등록되었지만 매핑 반영에 실패했습니다: ${err.message}`)
        // 항목은 유지해서 재시도 가능하게
      }
    } else {
      toast.error('상품 등록에 실패했습니다.')
    }
  } finally {
    item.isProcessing = false
  }
}

// 네이버 주문 동기화 실행
// 현재는 전용 페이지가 따로 있지만, 이 업로드 페이지에서도 같은 로직 상태를 재사용한다.
async function startNaverSync(mode: NaverSyncMode) {
  if (!canRunNaverSync.value || isNaverSyncRunning.value) return

  resetNaverSyncResult(mode)
  isNaverSyncRunning.value = true
  startNaverSyncPulse()
  appendNaverSyncLog(
    mode === 'dry-run'
      ? `드라이런 시작: ${naverSyncStartDate.value} ~ ${naverSyncEndDate.value}`
      : `실동기화 시작: ${naverSyncStartDate.value} ~ ${naverSyncEndDate.value}`,
    'info',
  )

  try {
    const response = await $fetch<NaverSyncResponse>(naverSyncEndpoint, {
      method: 'POST',
      body: {
        start: naverSyncStartDate.value,
        end: naverSyncEndDate.value,
        dryRun: mode === 'dry-run',
        requestedByAccountId: user.value.id || null,
      },
    })

    stopNaverSyncPulse(95)
    naverSyncProgressLabel.value = '응답 정리 중'
    naverSyncSummary.value = response.summary || null
    naverSyncLogs.value = buildNaverSyncLogs(response.stdout, response.stderr)
    naverSyncLastRunAt.value = formatUploadTimestamp(new Date().toISOString())

    if (mode === 'live') {
      for (const month of expandMonthRange(naverSyncStartDate.value, naverSyncEndDate.value)) {
        setUploadResult(month, {
          orderUploadDone: true,
        })
      }
      await refreshMonths()
      const latestSyncedMonth = naverSyncEndDate.value.slice(0, 7)
      if (latestSyncedMonth) {
        selectMonth(latestSyncedMonth)
      }
    }

    stopNaverSyncPulse(100)
    naverSyncProgressLabel.value = mode === 'dry-run' ? '드라이런 완료' : '실시간 동기화 완료'
    toast.success(mode === 'dry-run' ? '네이버 주문 드라이런이 완료되었습니다.' : '네이버 주문 동기화가 완료되었습니다.')
    await createNotification({
      type: mode === 'dry-run' ? 'info' : 'success',
      title: mode === 'dry-run' ? '네이버 주문 드라이런 완료' : '네이버 주문 동기화 완료',
      message: `${naverSyncStartDate.value} ~ ${naverSyncEndDate.value} 범위를 ${mode === 'dry-run' ? '미리보기' : '적재'}했습니다.`,
      link: '/upload',
      payload: {
        dryRun: mode === 'dry-run',
        range: `${naverSyncStartDate.value} ~ ${naverSyncEndDate.value}`,
        summary: response.summary || null,
      },
    })
  } catch (error: any) {
    stopNaverSyncPulse(100)
    const errorPayload = error?.data || null
    const nestedErrorData = errorPayload?.data || null
    naverSyncError.value = String(
      errorPayload?.message
      || nestedErrorData?.message
      || error?.message
      || '네이버 주문 동기화 중 알 수 없는 오류가 발생했습니다.',
    )
    naverSyncSummary.value = ((nestedErrorData?.summary || errorPayload?.summary || null) as NaverSyncSummary | null)
    naverSyncLogs.value = buildNaverSyncLogs(
      String(nestedErrorData?.stdout || errorPayload?.stdout || ''),
      String(nestedErrorData?.stderr || errorPayload?.stderr || ''),
    )
    naverSyncLastRunAt.value = formatUploadTimestamp(new Date().toISOString())
    naverSyncProgressLabel.value = '실행 실패'
    toast.error(naverSyncError.value)
    await createNotification({
      type: 'error',
      title: '네이버 주문 동기화 실패',
      message: naverSyncError.value,
      link: '/upload',
      payload: {
        dryRun: mode === 'dry-run',
        range: `${naverSyncStartDate.value} ~ ${naverSyncEndDate.value}`,
        error: naverSyncError.value,
      },
    })
  } finally {
    isNaverSyncRunning.value = false
  }
}

// 핵심 업로드 함수
// 1) campaign 찾기/생성
// 2) 기존 experiences 스냅샷 확보
// 3) 체험단 엑셀 rows 전처리
// 4) experiences insert
// 5) 미매핑 상품 수집
async function startUpload() {
  if (isViewer.value || selectedMonth.value === 'all') return
  uploadState.value = 'uploading'
  uploadProgress.value = 0
  const targetMonth = selectedMonth.value
  const batchId = crypto.randomUUID()
  const campaignNameForLog = inferredCampaignName.value || `${targetMonth} 웨이프로젝트`
  let rollbackCampaignId: number | null = null
  let experienceSnapshot: ExperienceDbRow[] = []
  let experiencesMutated = false

  async function rollbackUploadMutations() {
    const hasRollbackTarget = experiencesMutated && rollbackCampaignId !== null
    if (!hasRollbackTarget) return

    if (experiencesMutated && rollbackCampaignId !== null) {
      await clearCampaignExperiences(targetMonth, rollbackCampaignId)
      if (experienceSnapshot.length > 0) {
        await restoreCampaignExperiencesSnapshot(experienceSnapshot)
      }
    }
  }

  try {
    let expInserted = 0
    const unmappedProducts = new Map<string, { name: string; option: string }>()
    const productLookup = buildProductLookup(productCatalog.value)
    uploadProgress.value = 20

    // 체험단 적재
    if (sourceFile.value && parsedExpRows.value.length > 0) {
      const expData = preprocessExperiences(parsedExpRows.value)
      uploadProgress.value = 35

      // 캠페인 조회/생성
      const campaignName = campaignNameForLog
      let campaignId: number | null = null
      const { data: existing, error: existingError } = await runQueryWithRetry(
        '캠페인 조회',
        (signal) =>
          supabase
            .from('campaigns')
            .select('id')
            .eq('name', campaignName)
            .is('deleted_at', null)
            .maybeSingle()
            .abortSignal(signal),
      )
      if (existingError) throw new Error(`캠페인 조회 오류: ${existingError.message}`)
      if (existing) { campaignId = (existing as any).id }
      else {
        const { data: created, error: campErr } = await runQueryWithRetry(
          '캠페인 생성',
          (signal) =>
            supabase
              .from('campaigns')
              .insert({ name: campaignName })
              .select('id')
              .single()
              .abortSignal(signal),
        )
        if (campErr) throw new Error(`캠페인 생성 오류: ${campErr.message}`)
        campaignId = (created as any).id
      }
      uploadProgress.value = 50

      if (campaignId) {
        rollbackCampaignId = campaignId
        experienceSnapshot = await fetchCampaignExperiencesSnapshot(targetMonth, campaignId)
        await clearCampaignExperiences(targetMonth, campaignId)
        experiencesMutated = true
        const rows: ExperienceInsertRow[] = expData.map((r) => {
          const resolved = resolveMappedProduct(r.mission_product_name, r.option_info, productLookup)

          if (!resolved.mappedProductId) {
            const serialized = serializeUnmappedItem(resolved.normalizedName, resolved.normalizedOption)
            unmappedProducts.set(serialized, { name: resolved.normalizedName, option: resolved.normalizedOption })
          }
          return {
            upload_batch_id: batchId, target_month: targetMonth, campaign_id: campaignId!,
            mission_product_name: resolved.normalizedName, mapped_product_id: resolved.mappedProductId,
            option_info: resolved.normalizedOption || r.option_info || null, receiver_name: r.receiver_name,
            naver_id: r.naver_id, purchase_date: r.purchase_date,
          }
        })
        const dedupedMap = new Map<string, ExperienceInsertRow>()
        for (const row of rows) {
          const key = buildExperienceDedupKey(row)
          if (!dedupedMap.has(key)) dedupedMap.set(key, row)
        }
        const dedupedRows = Array.from(dedupedMap.values())
        const skippedDuplicates = rows.length - dedupedRows.length
        if (skippedDuplicates > 0) {
          toast.info(`체험단 시트 중복 ${skippedDuplicates}건을 스킵했습니다.`)
        }

        const totalExperienceBatches = Math.max(1, Math.ceil(dedupedRows.length / DB_BATCH_SIZE))
        for (let i = 0; i < dedupedRows.length; i += DB_BATCH_SIZE) {
          const batch = dedupedRows.slice(i, i + DB_BATCH_SIZE)
          const batchNumber = Math.floor(i / DB_BATCH_SIZE) + 1
          const { data, error } = await runQueryWithRetry(
            `체험단 적재 ${batchNumber}/${totalExperienceBatches} 배치`,
            (signal) =>
              supabase
                .from('experiences')
                .insert(batch)
                .select('id')
                .abortSignal(signal),
          )
          if (error) throw new Error(`체험단 적재 오류: ${error.message}`)
          expInserted += data?.length || 0

          const processed = Math.min(i + batch.length, dedupedRows.length)
          uploadProgress.value = 60 + Math.floor((processed / Math.max(dedupedRows.length, 1)) * 35)
        }
      }
    }
    uploadProgress.value = 95

    // 결과 처리
    uploadResultStats.value = { orderNew: 0, orderExcluded: 0, expInserted }
    const unmappedList = Array.from(unmappedProducts.values())
    const serializedUnmapped = unmappedList.map((item) => serializeUnmappedItem(item.name, item.option))
    if (unmappedList.length > 0) {
      mappingFailedItems.value = unmappedList.map((item) => ({
        originalName: item.name,
        originalOption: item.option,
        searchQuery: '',
        mappedProduct: '',
        mappedProductId: '',
        isProcessing: false,
      }))
    } else {
      mappingFailedItems.value = []
    }
    uploadProgress.value = 100

    try {
      await refreshMonths()
    } catch (error) {
      console.warn('Failed to refresh month list after upload:', error)
    }

    setTimeout(() => {
      uploadState.value = unmappedList.length > 0 ? 'mapping_required' : 'uploaded'
      setUploadResult(targetMonth, {
        orderUploadDone: false,
        influencerUploadDone: parsedExpRows.value.length > 0,
        campaignLabel: campaignNameForLog,
        mappingPending: unmappedList.length,
        uploadStats: { orderNew: 0, orderExcluded: 0, expInserted },
        unmappedProducts: serializedUnmapped,
      })
      uploadResultTimestamp.value = getWorkflow(targetMonth).lastOrderUpload || ''
      toast.success('업로드가 완료되었습니다.')
    }, 300)

    await createNotification({
      type: unmappedList.length > 0 ? 'warning' : 'success',
      title: '체험단 업로드 완료',
      message: `${targetMonth} 체험단 ${expInserted}건 반영${unmappedList.length > 0 ? `, 매핑 필요 ${unmappedList.length}건` : ''}`,
      link: '/upload',
      payload: {
        targetMonth,
        expInserted,
        mappingPending: unmappedList.length,
      },
    })
  } catch (err) {
    console.error('Upload error:', err)
    try {
      await rollbackUploadMutations()
      toast.error('업로드 중 오류가 발생해 자동 복구를 수행했습니다. 다시 시도해 주세요.')
    } catch (rollbackError) {
      console.error('Upload rollback error:', rollbackError)
      toast.error('업로드 실패 후 자동 복구 중 오류가 발생했습니다. 관리자 확인이 필요합니다.')
    }
    uploadState.value = 'empty'
    uploadProgress.value = 0

    await createNotification({
      type: 'error',
      title: '데이터 업로드 실패',
      message: `${targetMonth} 업로드 중 오류가 발생했습니다. 자동 복구 후 다시 시도해 주세요.`,
      link: '/upload',
      payload: {
        targetMonth,
        error: String((err as any)?.message || '업로드 오류'),
      },
    })
  }
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  const headers = ['미션상품명', '옵션정보', '수취인명', '아이디', '구매인증일', '캠페인명']
  const sample = ['유산균 파우더 30포', '기본', '김지윤', 'kimj****', '2025-02-12', '2025년 2월 블로그 체험단']
  const ws = XLSX.utils.aoa_to_sheet([headers, sample])
  XLSX.utils.book_append_sheet(wb, ws, '체험단양식')
  XLSX.writeFile(wb, '체험단업로드_예시양식.xlsx')
}

const uploadResults = computed(() => {
  if (!hasResult.value) return []
  const s = uploadResultStats.value
  const timestamp = uploadResultTimestamp.value || '-'
  const r = []
  if (s.expInserted > 0) r.push({ time: timestamp, description: '체험단 데이터 업로드 반영', count: s.expInserted, type: 'info' })
  return r
})

onBeforeUnmount(() => {
  stopNaverSyncPulse()
})

watch(
  () => [selectedMonth.value, profileLoaded.value, profileRevision.value],
  async ([month, loaded], previousValue) => {
    if (!loaded) return
    const previousMonth = previousValue?.[0]
    const syncId = ++monthSyncSeq.value
    if (isUploading.value) return
    if (month !== previousMonth) {
      resetSourceFileState()
      uploadResultStats.value = { orderNew: 0, orderExcluded: 0, expInserted: 0 }
    }

    if (month === 'all') { uploadState.value = 'empty'; mappingFailedItems.value = []; return }

    const wf = getWorkflow(month)
    inferredCampaignName.value = ''
    uploadResultTimestamp.value = ''

    let expCount = 0
    let latestUploadAt = ''
    let dbChecked = false
    try {
      const meta = await fetchMonthUploadMeta(month)
      if (syncId !== monthSyncSeq.value) return
      expCount = meta.expCount
      latestUploadAt = meta.latestUploadAt
      dbChecked = true
    } catch (error) {
      console.warn('Failed to fetch upload counts for month:', month, error)
    }

    const hasExperienceUpload = dbChecked ? expCount > 0 : wf.influencerUploadDone
    if (!hasExperienceUpload) {
      mappingFailedItems.value = []
      uploadResultStats.value = { orderNew: 0, orderExcluded: 0, expInserted: 0 }
      uploadResultTimestamp.value = ''
      inferredCampaignName.value = ''
      uploadState.value = 'empty'
      return
    }

    uploadResultStats.value = {
      orderNew: 0,
      orderExcluded: 0,
      expInserted: wf.uploadStats.expInserted > 0 ? wf.uploadStats.expInserted : expCount,
    }
    if (!uploadResultTimestamp.value && latestUploadAt) {
      uploadResultTimestamp.value = latestUploadAt
    }
    inferredCampaignName.value = wf.campaignLabel === '미등록' ? '' : wf.campaignLabel
    mappingFailedItems.value = wf.unmappedProducts.map((serialized) => {
      const parsed = deserializeUnmappedItem(serialized)
      return {
        originalName: parsed.name,
        originalOption: parsed.option,
        searchQuery: '',
        mappedProduct: '',
        mappedProductId: '',
        isProcessing: false,
      }
    })

    if (wf.mappingPending > 0) uploadState.value = 'mapping_required'
    else uploadState.value = 'uploaded'
  },
  { immediate: true },
)
</script>

<style scoped>
.upload-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.upload-state-card {
  padding: var(--space-lg) var(--space-xl);
}

.upload-state-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-xs);
}

.upload-state-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.upload-state-desc {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.upload-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-lg);
}

.upload-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.file-selected {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.file-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text);
}

.file-size {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.sheet-map {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.validation-block {
  margin-top: var(--space-md);
}

.validation-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-xs);
}

.validation-preview {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-success-light);
  border-radius: var(--radius-md);
  font-size: 0.8125rem;
  color: #065F46;
}

.validation-preview.error {
  background: #FEF3C7;
  color: #92400E;
}

.validation-preview strong {
  font-weight: 600;
}

.missing-columns {
  margin-top: var(--space-sm);
}

.missing-columns-label {
  display: block;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-xs);
}

.missing-columns-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.missing-column-chip {
  font-size: 0.6875rem;
  padding: 3px 8px;
  border-radius: 100px;
  background: #FEF3C7;
  color: #92400E;
}

.upload-actions {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}

.naver-sync-card {
  border: 1px solid rgba(37, 99, 235, 0.14);
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.1), transparent 40%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
}

.sync-card-copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.sync-link-btn {
  width: fit-content;
  margin-top: var(--space-sm);
}

.sync-endpoint-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  width: fit-content;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.08);
  color: #1D4ED8;
  font-size: 0.75rem;
  font-family: var(--font-mono);
}

.sync-date-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
  margin-top: var(--space-md);
}

.sync-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.sync-date-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.875rem;
}

.sync-preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-top: var(--space-md);
}

.sync-actions {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
  margin-top: var(--space-lg);
}

.sync-spinner {
  animation: sync-spin 1s linear infinite;
}

.sync-result-shell {
  margin-top: var(--space-lg);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-border-light);
}

.sync-progress-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: var(--space-sm);
}

.sync-progress-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sync-progress-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
}

.sync-progress-range {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.sync-progress-footer {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
}

.sync-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.sync-summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  border: 1px solid var(--color-border-light);
}

.sync-summary-item.tone-info {
  background: rgba(59, 130, 246, 0.06);
}

.sync-summary-item.tone-success {
  background: rgba(16, 185, 129, 0.08);
}

.sync-summary-item.tone-warning {
  background: rgba(245, 158, 11, 0.1);
}

.sync-summary-item.tone-danger {
  background: rgba(239, 68, 68, 0.08);
}

.sync-summary-label {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

.sync-summary-value {
  font-size: 0.9375rem;
  color: var(--color-text);
  word-break: break-word;
}

.sync-log-panel {
  margin-top: var(--space-md);
}

.sync-log-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-xs);
}

.sync-log-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow: auto;
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  border: 1px solid var(--color-border-light);
}

.sync-log-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-xs);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.sync-log-item.success {
  color: #065F46;
}

.sync-log-item.warning {
  color: #92400E;
}

.sync-log-item.error {
  color: #991B1B;
}

.sync-log-time {
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.sync-log-message {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-word;
}

@keyframes sync-spin {
  to {
    transform: rotate(360deg);
  }
}

.result-timeline {
  display: flex;
  flex-direction: column;
}

.timeline-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) 0;
  border-bottom: 1px solid var(--color-border-light);
}

.timeline-item:last-child {
  border-bottom: none;
}

.timeline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.timeline-dot.success { background: var(--color-success); }
.timeline-dot.info { background: var(--color-primary); }
.timeline-dot.warning { background: var(--color-warning); }

.timeline-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.timeline-time {
  font-size: 0.6875rem;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
}

.timeline-desc {
  font-size: 0.8125rem;
  color: var(--color-text);
}

.timeline-count {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
}

.card-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.next-step-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-lg);
  padding: var(--space-md) var(--space-lg);
  background: #EFF6FF;
  border-radius: var(--radius-md);
  border: 1px solid #BFDBFE;
}

.next-step-text {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 0.8125rem;
  color: #1E40AF;
}

.mapping-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.mapping-search-wrap {
  position: relative;
  width: 260px;
}

.mapping-row-actions {
  display: flex;
  gap: var(--space-sm);
}

.mapping-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
  z-index: 20;
  padding: 4px;
}

.mapping-suggestion-item {
  width: 100%;
  text-align: left;
  font-size: 0.75rem;
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  color: var(--color-text);
}

.mapping-suggestion-item:hover {
  background: var(--color-bg);
}

@media (max-width: 1024px) {
  .upload-grid {
    grid-template-columns: 1fr;
  }

  .next-step-banner {
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .sync-date-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .upload-page {
    gap: var(--space-lg);
  }

  .upload-header-actions {
    width: 100%;
  }

  .file-selected {
    flex-wrap: wrap;
    justify-content: center;
  }

  .drop-zone {
    padding: var(--space-xl) var(--space-md);
  }

  .next-step-banner {
    flex-direction: column;
    align-items: flex-start;
  }

  .mapping-header-actions {
    width: 100%;
  }

  .mapping-search-wrap {
    width: 100%;
  }

  .mapping-row-actions {
    flex-direction: column;
  }

  .mapping-row-actions .btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
