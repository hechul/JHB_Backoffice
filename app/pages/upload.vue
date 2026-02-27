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
            통합 엑셀 업로드 (2개 시트)
          </h3>
          <div class="flex gap-sm items-center">
            <button class="btn btn-ghost btn-sm" @click="downloadTemplate('order')">
              <Download :size="14" :stroke-width="2" />
              주문 양식
            </button>
            <button class="btn btn-ghost btn-sm" @click="downloadTemplate('influencer')">
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
          하나의 엑셀 안에 시트 2개를 포함해야 합니다:
          <strong>네이버 스스(주문)</strong>, <strong>웨이프로젝트(체험단)</strong>
        </p>

        <div v-if="sourceFile" class="sheet-map">
          <StatusBadge
            :label="`주문 시트: ${isSourceParsing ? '탐지 중...' : (detectedOrderSheetName || '미탐지')}`"
            :variant="isSourceParsing ? 'info' : (detectedOrderSheetName ? 'success' : 'danger')"
          />
          <StatusBadge
            :label="`체험단 시트: ${isSourceParsing ? '탐지 중...' : (detectedExperienceSheetName || '미탐지')}`"
            :variant="isSourceParsing ? 'info' : (detectedExperienceSheetName ? 'success' : 'danger')"
          />
        </div>

        <div v-if="orderValidation" class="validation-block">
          <div class="validation-title">네이버 스스(주문) 시트 검증</div>
          <div class="validation-preview" :class="{ error: orderValidation.missing.length > 0 }">
            <AlertTriangle v-if="orderValidation.missing.length > 0" :size="14" :stroke-width="2" />
            <CheckCircle v-else :size="14" :stroke-width="2" style="color: var(--color-success)" />
            <span>필수 컬럼 {{ orderValidation.total }}개 중 <strong>{{ orderValidation.total - orderValidation.missing.length }}개</strong> 확인됨</span>
          </div>
          <div v-if="orderValidation.missing.length" class="missing-columns">
            <span class="missing-columns-label">누락 컬럼:</span>
            <div class="missing-columns-list">
              <span v-for="column in orderValidation.missing" :key="`order-${column}`" class="missing-column-chip">{{ column }}</span>
            </div>
          </div>
        </div>

        <div v-if="influencerValidation" class="validation-block">
          <div class="validation-title">웨이프로젝트(체험단) 시트 검증</div>
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
          새 상품 연결 필요 (주문/체험단)
        </h3>
        <div class="flex items-center gap-sm">
          <StatusBadge :label="`남은 ${remainingMappingCount}건`" variant="warning" />
          <StatusBadge :label="`완료 ${mappedCount}건`" variant="success" />
        </div>
      </div>

      <div class="alert alert-warning mb-lg">
        <AlertTriangle :size="16" :stroke-width="2" />
        <span>주문/체험단 데이터의 상품/옵션 조합 중 등록되지 않은 항목입니다. 기존 상품 검색으로 연결하거나 새로 등록해 주세요.</span>
      </div>

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
              <div v-if="!isViewer" class="flex gap-sm">
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

    <div v-if="!hasResult && !isUploading" class="card">
      <EmptyState
        title="업로드 이력이 없습니다"
        description="시트 2개가 포함된 통합 엑셀을 업로드하면 결과가 여기에 표시됩니다."
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
} from 'lucide-vue-next'
import {
  parseExcelWorkbook,
  findSheetByPreferredNames,
  detectSheetByColumns,
  validateColumns,
  preprocessOrders,
  preprocessExperiences,
  extractExperienceRows,
  normalizeExperienceHeader,
  type ParsedWorkbookSheet,
  type ColumnValidation,
} from '~/composables/useExcelParser'
import { matchesSearchQuery } from '~/composables/useTextSearch'
import * as XLSX from 'xlsx'

interface MappingItem {
  originalName: string
  originalOption: string
  searchQuery: string
  mappedProduct: string
  mappedProductId: string
  isProcessing?: boolean
}

interface ProductCatalogItem {
  product_id: string
  product_name: string
  option_name: string | null
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

interface PurchaseDbRow {
  purchase_id: string
  upload_batch_id: string
  target_month: string
  buyer_id: string
  buyer_name: string
  receiver_name: string | null
  customer_key: string
  product_id: string
  product_name: string
  option_info: string | null
  quantity: number
  order_date: string
  order_status: string
  claim_status: string | null
  delivery_type: string | null
  is_fake: boolean
  match_reason: string | null
  match_rank: number | null
  matched_exp_id: number | null
  needs_review: boolean
  is_manual: boolean
  filter_ver: string | null
  quantity_warning: boolean
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
  purchaseUpdated: number
  experienceUpdated: number
}

const supabase = useSupabaseClient()
const toast = useToast()
const { isViewer } = useCurrentUser()
const { selectedMonth, refreshMonths } = useAnalysisPeriod()
const { getWorkflow, setUploadResult, setMappingPending, setUnmappedProducts, resetMonth } = useMonthlyWorkflow()

const sourceFile = ref<File | null>(null)
const orderValidation = ref<ColumnValidation | null>(null)
const influencerValidation = ref<ColumnValidation | null>(null)
const sourceDragOver = ref(false)
const detectedOrderSheetName = ref('')
const detectedExperienceSheetName = ref('')
const inferredCampaignName = ref('')
const uploadProgress = ref(0)
const sourceInput = ref<HTMLInputElement | null>(null)

const parsedOrderRows = ref<Record<string, string>[]>([])
const parsedExpRows = ref<Record<string, string>[]>([])
const monthSyncSeq = ref(0)
const isSourceParsing = ref(false)

type UploadState = 'empty' | 'uploading' | 'uploaded' | 'mapping_required'
const uploadState = ref<UploadState>('empty')
const mappingFailedItems = ref<MappingItem[]>([])
const uploadResultTimestamp = ref('')

const uploadResultStats = ref({ orderNew: 0, orderExcluded: 0, expInserted: 0 })

const isUploading = computed(() => uploadState.value === 'uploading')
const hasResult = computed(() => uploadState.value === 'uploaded' || uploadState.value === 'mapping_required')
const needsMapping = computed(() => uploadState.value === 'mapping_required')
const mappedCount = computed(() => mappingFailedItems.value.filter((item) => !!item.mappedProductId).length)
const remainingMappingCount = computed(() => Math.max(0, mappingFailedItems.value.length - mappedCount.value))

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
    empty: '시트 2개(네이버 스스/웨이프로젝트)가 포함된 통합 엑셀 파일을 선택한 뒤 업로드를 시작하세요.',
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
  if (!detectedOrderSheetName.value || !detectedExperienceSheetName.value) return false
  if (!orderValidation.value || orderValidation.value.missing.length > 0) return false
  if (!influencerValidation.value || influencerValidation.value.missing.length > 0) return false
  if (parsedOrderRows.value.length === 0 || parsedExpRows.value.length === 0) return false
  return true
})

const uploadBlockReason = computed(() => {
  if (selectedMonth.value === 'all') return '특정 월을 선택한 뒤 업로드를 진행해 주세요.'
  if (!sourceFile.value) return '통합 엑셀(.xlsx/.xls) 파일을 선택해 주세요.'
  if (isSourceParsing.value) return '시트/컬럼을 분석 중입니다. 잠시만 기다려 주세요.'
  if (!detectedOrderSheetName.value) return '주문 시트를 찾지 못했습니다. 시트명(네이버 스스) 또는 컬럼 구성을 확인해 주세요.'
  if (!detectedExperienceSheetName.value) return '체험단 시트를 찾지 못했습니다. 시트명(웨이프로젝트) 또는 컬럼 구성을 확인해 주세요.'
  if (orderValidation.value && orderValidation.value.missing.length > 0) return '주문 시트에 필수 컬럼이 누락되어 있습니다.'
  if (influencerValidation.value && influencerValidation.value.missing.length > 0) return '체험단 시트에 필수 컬럼이 누락되어 있습니다.'
  if (parsedOrderRows.value.length === 0) return '주문 시트 데이터가 비어 있습니다.'
  if (parsedExpRows.value.length === 0) return '체험단 시트 데이터가 비어 있습니다.'
  return ''
})

const orderRequiredColumns = ['상품주문번호', '상품명', '상품번호', '옵션정보', '수량', '구매자명', '구매자ID', '수취인명', '주문일시', '주문상태', '클레임상태']
const influencerRequiredColumns = ['미션상품명', '옵션정보', '수취인명', '아이디', '구매인증일', '캠페인명']
const orderSheetAliases = ['네이버 스스', '네이버스스', '스마트스토어', '네이버 스마트스토어']
const experienceSheetAliases = ['웨이프로젝트', '웨이 프로젝트', '체험단']
const missionProductRules: { keywords: string[]; canonical: string }[] = [
  { keywords: ['애착트릿'], canonical: '애착트릿' },
  { keywords: ['츄라잇'], canonical: '츄라잇' },
  { keywords: ['케어푸'], canonical: '케어푸' },
  { keywords: ['두부모래'], canonical: '두부모래' },
  { keywords: ['이즈바이트'], canonical: '이즈바이트' },
  { keywords: ['엔자이츄'], canonical: '엔자이츄' },
  { keywords: ['트릿백'], canonical: '미니 트릿백' },
  { keywords: ['츄르짜개'], canonical: '츄르짜개 (고양이 간식 디스펜서)' },
  { keywords: ['도시락'], canonical: '도시락 샘플팩' },
  { keywords: ['맛보기'], canonical: '전제품 맛보기 샘플' },
]
const unmappedOptionDelimiter = '__OPT__'

const optionKeywordRules: { product: string; keywords: string[]; canonical: string }[] = [
  { product: '애착트릿', keywords: ['북어'], canonical: '북어' },
  { product: '애착트릿', keywords: ['연어'], canonical: '연어' },
  { product: '애착트릿', keywords: ['치킨'], canonical: '치킨' },
  { product: '애착트릿', keywords: ['닭가슴살'], canonical: '치킨' },
  { product: '애착트릿', keywords: ['닭고기'], canonical: '치킨' },
  { product: '애착트릿', keywords: ['3종세트', '3종 세트'], canonical: '3종세트' },
  { product: '동결건조(리뉴얼전)', keywords: ['북어'], canonical: '북어' },
  { product: '동결건조(리뉴얼전)', keywords: ['연어'], canonical: '연어' },
  { product: '동결건조(리뉴얼전)', keywords: ['치킨'], canonical: '치킨' },
  { product: '동결건조(리뉴얼전)', keywords: ['닭가슴살'], canonical: '치킨' },
  { product: '동결건조(리뉴얼전)', keywords: ['닭고기'], canonical: '치킨' },
  { product: '츄라잇', keywords: ['데일리핏'], canonical: '데일리핏' },
  { product: '츄라잇', keywords: ['클린펫'], canonical: '클린펫' },
  { product: '츄라잇', keywords: ['브라이트'], canonical: '브라이트' },
  { product: '미니 트릿백', keywords: ['민트'], canonical: '민트' },
  { product: '미니 트릿백', keywords: ['퍼플'], canonical: '퍼플' },
  { product: '츄르짜개 (고양이 간식 디스펜서)', keywords: ['옐로', 'yellow'], canonical: '옐로' },
  { product: '츄르짜개 (고양이 간식 디스펜서)', keywords: ['블루', 'blue'], canonical: '블루' },
  { product: '츄르짜개 (고양이 간식 디스펜서)', keywords: ['퍼플', 'purple'], canonical: '퍼플' },
  { product: '도시락 샘플팩', keywords: ['강아지용'], canonical: '강아지용' },
  { product: '도시락 샘플팩', keywords: ['고양이용'], canonical: '고양이용' },
]

const DB_BATCH_SIZE = 50
const DB_REQUEST_TIMEOUT_MS = 20000
const DB_REQUEST_MAX_RETRIES = 3

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

function chunkArray<T>(items: T[], chunkSize = DB_BATCH_SIZE): T[][] {
  if (items.length === 0) return []
  const size = Math.max(1, Math.floor(chunkSize))
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function applyOptionFilter(query: any, optionValue: string) {
  if (optionValue) {
    return query.eq('option_info', optionValue)
  }
  return query.or('option_info.is.null,option_info.eq.')
}

function toPurchaseRestorePayload(row: PurchaseDbRow) {
  return {
    upload_batch_id: row.upload_batch_id,
    target_month: row.target_month,
    buyer_id: row.buyer_id,
    buyer_name: row.buyer_name,
    receiver_name: row.receiver_name,
    customer_key: row.customer_key,
    product_id: row.product_id,
    product_name: row.product_name,
    option_info: row.option_info,
    quantity: row.quantity,
    order_date: row.order_date,
    order_status: row.order_status,
    claim_status: row.claim_status,
    delivery_type: row.delivery_type,
    is_fake: row.is_fake,
    match_reason: row.match_reason,
    match_rank: row.match_rank,
    matched_exp_id: row.matched_exp_id,
    needs_review: row.needs_review,
    is_manual: row.is_manual,
    filter_ver: row.filter_ver,
    quantity_warning: row.quantity_warning,
  }
}

async function fetchExistingPurchasesSnapshot(purchaseIds: string[]): Promise<Map<string, PurchaseDbRow>> {
  const ids = Array.from(new Set(purchaseIds.map((id) => String(id || '').trim()).filter(Boolean)))
  const snapshot = new Map<string, PurchaseDbRow>()
  if (ids.length === 0) return snapshot

  const columns = [
    'purchase_id',
    'upload_batch_id',
    'target_month',
    'buyer_id',
    'buyer_name',
    'receiver_name',
    'customer_key',
    'product_id',
    'product_name',
    'option_info',
    'quantity',
    'order_date',
    'order_status',
    'claim_status',
    'delivery_type',
    'is_fake',
    'match_reason',
    'match_rank',
    'matched_exp_id',
    'needs_review',
    'is_manual',
    'filter_ver',
    'quantity_warning',
  ].join(', ')

  for (const batch of chunkArray(ids)) {
    const { data, error } = await runQueryWithRetry(
      '업로드 롤백용 기존 주문 스냅샷 조회',
      (signal) =>
        supabase
          .from('purchases')
          .select(columns)
          .in('purchase_id', batch)
          .abortSignal(signal),
    )
    if (error) throw error

    for (const row of ((data || []) as PurchaseDbRow[])) {
      snapshot.set(String(row.purchase_id), row)
    }
  }

  return snapshot
}

async function deletePurchasesByIds(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)))
  for (const batch of chunkArray(uniqueIds)) {
    const { error } = await runQueryWithRetry(
      '업로드 롤백용 신규 주문 삭제',
      (signal) =>
        supabase
          .from('purchases')
          .delete()
          .in('purchase_id', batch)
          .abortSignal(signal),
    )
    if (error) throw error
  }
}

async function restorePurchaseSnapshots(rows: PurchaseDbRow[]) {
  const restoreRows = rows.filter((row) => Boolean(row?.purchase_id))
  for (const batch of chunkArray(restoreRows)) {
    await Promise.all(batch.map(async (row) => {
      const { error } = await runQueryWithRetry(
        `업로드 롤백용 기존 주문 복원(${row.purchase_id})`,
        (signal) =>
          supabase
            .from('purchases')
            .update(toPurchaseRestorePayload(row))
            .eq('purchase_id', row.purchase_id)
            .abortSignal(signal),
      )
      if (error) throw error
    }))
  }
}

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

async function fetchMonthUploadCounts(month: string): Promise<{ orderCount: number; expCount: number }> {
  const [{ count: orderCount, error: orderError }, { count: expCount, error: expError }] = await Promise.all([
    supabase
      .from('purchases')
      .select('purchase_id', { count: 'exact', head: true })
      .eq('target_month', month),
    supabase
      .from('experiences')
      .select('id', { count: 'exact', head: true })
      .eq('target_month', month),
  ])

  if (orderError) throw orderError
  if (expError) throw expError

  return {
    orderCount: Number(orderCount || 0),
    expCount: Number(expCount || 0),
  }
}

function normalizeForMatch(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '')
}

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
  orderValidation.value = null
  influencerValidation.value = null
  parsedOrderRows.value = []
  parsedExpRows.value = []
  detectedOrderSheetName.value = ''
  detectedExperienceSheetName.value = ''
  inferredCampaignName.value = ''
}

function normalizeMissionProductName(rawName: string): string {
  const name = String(rawName || '').trim()
  if (!name) return ''

  const normalizedName = normalizeForMatch(name)

  // 리뉴얼 전 동결건조 라인:
  // "동결건조(또는 동견건조) 포함 + 애착트릿 미포함"이면 별도 상품으로 분리한다.
  const hasFreezeDried = normalizedName.includes('동결건조') || normalizedName.includes('동견건조')
  const hasAttachmentTreat = normalizedName.includes('애착트릿')
  if (hasFreezeDried && !hasAttachmentTreat) {
    return '동결건조(리뉴얼전)'
  }

  const matched = missionProductRules.find((rule) =>
    rule.keywords.some((kw) => normalizedName.includes(normalizeForMatch(kw))),
  )
  return matched?.canonical || name
}

function matchOptionKeyword(productName: string, source: string): string {
  const normalizedSource = normalizeForMatch(source)
  if (!normalizedSource) return ''
  const matched = optionKeywordRules.find((rule) =>
    rule.product === productName &&
    rule.keywords.some((kw) => normalizedSource.includes(normalizeForMatch(kw))),
  )
  return matched?.canonical || ''
}

function normalizeOptionLabel(productName: string, rawOption: string, rawMissionName: string): string {
  const option = String(rawOption || '').trim()
  const missionName = String(rawMissionName || '').trim()

  // 두부모래는 옵션(개수)을 매핑 기준에서 사용하지 않는다.
  if (productName === '두부모래') return ''

  const keywordByOption = matchOptionKeyword(productName, option)
  if (keywordByOption) return keywordByOption
  const keywordByMission = matchOptionKeyword(productName, missionName)
  if (keywordByMission) return keywordByMission

  if (!option) return ''
  return option.replace(/\s+/g, ' ').trim()
}

function normalizeOptionKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()]/g, '')
    .replace(/[|/]/g, '')
}

function makeProductMatchKey(productName: string, optionName: string): string {
  return `${productName.trim().toLowerCase()}::${normalizeOptionKey(optionName)}`
}

function buildProductLookup() {
  const exactMap = new Map<string, string>()
  const baseMap = new Map<string, string>()
  const anyNameMap = new Map<string, string>()

  for (const product of productCatalog.value) {
    const normalizedProductName = normalizeMissionProductName(product.product_name)
    exactMap.set(makeProductMatchKey(product.product_name, product.option_name || ''), product.product_id)
    exactMap.set(makeProductMatchKey(normalizedProductName, product.option_name || ''), product.product_id)
    if (!anyNameMap.has(product.product_name.toLowerCase())) {
      anyNameMap.set(product.product_name.toLowerCase(), product.product_id)
    }
    if (!anyNameMap.has(normalizedProductName.toLowerCase())) {
      anyNameMap.set(normalizedProductName.toLowerCase(), product.product_id)
    }
    if (!product.option_name && !baseMap.has(product.product_name.toLowerCase())) {
      baseMap.set(product.product_name.toLowerCase(), product.product_id)
    }
    if (!product.option_name && !baseMap.has(normalizedProductName.toLowerCase())) {
      baseMap.set(normalizedProductName.toLowerCase(), product.product_id)
    }
  }

  return { exactMap, baseMap, anyNameMap }
}

function resolveMappedProduct(
  rawProductName: string,
  rawOption: string,
  lookup: ReturnType<typeof buildProductLookup>,
): { normalizedName: string; normalizedOption: string; mappedProductId: string | null } {
  const normalizedName = normalizeMissionProductName(rawProductName)
  const normalizedOption = normalizeOptionLabel(normalizedName, rawOption, rawProductName)
  const isOptionAgnostic = normalizedName === '두부모래'
  const mappedProductId =
    (isOptionAgnostic
      ? lookup.anyNameMap.get(normalizedName.toLowerCase())
      : lookup.exactMap.get(makeProductMatchKey(normalizedName, normalizedOption)))
    || lookup.baseMap.get(normalizedName.toLowerCase())
    || null

  return { normalizedName, normalizedOption, mappedProductId }
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

function pickOrderSheet(sheets: ParsedWorkbookSheet[]): ParsedWorkbookSheet | null {
  return (
    findSheetByPreferredNames(sheets, orderSheetAliases)
    || detectSheetByColumns(sheets, orderRequiredColumns)
  )
}

function pickExperienceSheet(sheets: ParsedWorkbookSheet[], excludedNames: string[]): ParsedWorkbookSheet | null {
  return (
    findSheetByPreferredNames(sheets, experienceSheetAliases, excludedNames)
    || detectSheetByColumns(sheets, influencerRequiredColumns, excludedNames)
  )
}

// ── 파일 선택 시 실제 엑셀 파싱(시트 2개) ──
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
    const orderSheet = pickOrderSheet(sheets)
    const experienceSheet = pickExperienceSheet(sheets, orderSheet ? [orderSheet.name] : [])

    detectedOrderSheetName.value = orderSheet?.name || ''
    detectedExperienceSheetName.value = experienceSheet?.name || ''

    if (orderSheet) {
      parsedOrderRows.value = orderSheet.rows
      orderValidation.value = validateColumns(orderSheet.headers, orderRequiredColumns)
    } else {
      orderValidation.value = {
        total: orderRequiredColumns.length,
        matched: [],
        missing: [...orderRequiredColumns],
      }
    }

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

// ── 매핑 (Supabase 실 데이터) ──
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
    return { purchaseUpdated: 0, experienceUpdated: 0 }
  }

  const matchedProduct = productCatalog.value.find((p) => p.product_id === mappedProductId)
  const normalizedProductName = matchedProduct?.product_name || item.originalName
  const normalizedOption = matchedProduct?.option_name || null

  const purchasePayload: Record<string, any> = {
    product_id: mappedProductId,
    product_name: normalizedProductName,
  }
  if (normalizedOption) purchasePayload.option_info = normalizedOption

  let purchaseQuery = supabase
    .from('purchases')
    .update(purchasePayload)
    .eq('target_month', selectedMonth.value)
    .eq('product_name', item.originalName)
  purchaseQuery = applyOptionFilter(purchaseQuery, item.originalOption)
  const { data: purchaseData, error: purchaseError } = await purchaseQuery.select('purchase_id')
  if (purchaseError) {
    console.error('Failed to apply mapped product to purchases:', purchaseError)
    throw new Error(`주문 DB 반영 실패: ${purchaseError.message}`)
  }

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
    purchaseUpdated: Array.isArray(purchaseData) ? purchaseData.length : 0,
    experienceUpdated: Array.isArray(expData) ? expData.length : 0,
  }
  if (result.purchaseUpdated + result.experienceUpdated === 0) {
    throw new Error('적용 대상이 없어 반영되지 않았습니다. 원본 상품명/옵션 조건을 확인해 주세요.')
  }
  return result
}

async function connectItem(item: MappingItem) {
  if (!item.mappedProductId || item.isProcessing) return
  item.isProcessing = true
  try {
    const applied = await applyMappedProductToDataset(item, item.mappedProductId)
    toast.success(`"${item.mappedProduct}" 연결 완료 (주문 ${applied.purchaseUpdated}건, 체험단 ${applied.experienceUpdated}건)`)
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
        toast.success(`"${item.mappedProduct}" 상품이 등록되었습니다. (주문 ${applied.purchaseUpdated}건, 체험단 ${applied.experienceUpdated}건 반영)`)
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

// ── 핵심: 업로드 실행 (Supabase 연동) ──
async function startUpload() {
  if (isViewer.value || selectedMonth.value === 'all') return
  uploadState.value = 'uploading'
  uploadProgress.value = 0
  const targetMonth = selectedMonth.value
  const batchId = crypto.randomUUID()
  const campaignNameForLog = inferredCampaignName.value || `${targetMonth} 웨이프로젝트`
  const touchedPurchaseIds = new Set<string>()
  let purchaseSnapshotById = new Map<string, PurchaseDbRow>()
  let ordersMutated = false
  let rollbackCampaignId: number | null = null
  let experienceSnapshot: ExperienceDbRow[] = []
  let experiencesMutated = false

  async function rollbackUploadMutations() {
    const hasRollbackTarget = ordersMutated || (experiencesMutated && rollbackCampaignId !== null)
    if (!hasRollbackTarget) return

    if (experiencesMutated && rollbackCampaignId !== null) {
      await clearCampaignExperiences(targetMonth, rollbackCampaignId)
      if (experienceSnapshot.length > 0) {
        await restoreCampaignExperiencesSnapshot(experienceSnapshot)
      }
    }

    if (ordersMutated) {
      const existingIdSet = new Set(purchaseSnapshotById.keys())
      const insertedIds = Array.from(touchedPurchaseIds).filter((id) => !existingIdSet.has(id))
      if (insertedIds.length > 0) {
        await deletePurchasesByIds(insertedIds)
      }

      const restoreRows = Array.from(purchaseSnapshotById.values())
        .filter((row) => touchedPurchaseIds.has(String(row.purchase_id || '')))
      if (restoreRows.length > 0) {
        await restorePurchaseSnapshots(restoreRows)
      }
    }
  }

  try {
    let orderNew = 0, orderExcluded = 0, expInserted = 0
    const unmappedProducts = new Map<string, { name: string; option: string }>()
    const productLookup = buildProductLookup()

    // 1. 주문 적재
    if (sourceFile.value && parsedOrderRows.value.length > 0) {
      uploadProgress.value = 10
      const { valid, excluded } = preprocessOrders(parsedOrderRows.value)
      orderExcluded = excluded
      const resolvedOrderMap = new Map<string, ReturnType<typeof resolveMappedProduct>>()
      const purchaseIds = valid.map((row) => String(row.purchase_id || '').trim()).filter(Boolean)
      for (const id of purchaseIds) touchedPurchaseIds.add(id)
      purchaseSnapshotById = await fetchExistingPurchasesSnapshot(purchaseIds)

      // 스마트스토어 주문 상품도 상품목록 기준으로 미등록 여부를 먼저 체크한다.
      for (const row of valid) {
        const resolved = resolveMappedProduct(row.product_name, row.option_info, productLookup)
        resolvedOrderMap.set(row.purchase_id, resolved)
        if (!resolved.mappedProductId) {
          const serialized = serializeUnmappedItem(resolved.normalizedName, resolved.normalizedOption)
          unmappedProducts.set(serialized, { name: resolved.normalizedName, option: resolved.normalizedOption })
        }
      }

      uploadProgress.value = 30

      const totalOrderBatches = Math.max(1, Math.ceil(valid.length / DB_BATCH_SIZE))
      for (let i = 0; i < valid.length; i += DB_BATCH_SIZE) {
        const batch = valid.slice(i, i + DB_BATCH_SIZE).map((row) => {
          const resolved = resolvedOrderMap.get(row.purchase_id)
          return {
            purchase_id: row.purchase_id,
            upload_batch_id: batchId,
            target_month: targetMonth,
            buyer_id: row.buyer_id,
            buyer_name: row.buyer_name,
            receiver_name: row.receiver_name,
            customer_key: row.customer_key,
            // 고객분석/필터링에서 products와 조인 가능한 내부 상품ID를 우선 저장한다.
            product_id: resolved?.mappedProductId || row.product_id,
            product_name: resolved?.normalizedName || row.product_name,
            option_info: resolved?.normalizedOption || row.option_info || '',
            quantity: row.quantity,
            order_date: row.order_date,
            order_status: row.order_status,
            claim_status: row.claim_status,
            quantity_warning: row.quantity >= 2,
          }
        })
        const batchNumber = Math.floor(i / DB_BATCH_SIZE) + 1
        const { data, error } = await runQueryWithRetry(
          `주문 적재 ${batchNumber}/${totalOrderBatches} 배치`,
          (signal) =>
            supabase
              .from('purchases')
              .upsert(batch, { onConflict: 'purchase_id' })
              .select('purchase_id')
              .abortSignal(signal),
        )
        if (error) throw new Error(`주문 적재 오류: ${error.message}`)
        if (!ordersMutated) ordersMutated = true
        orderNew += data?.length || 0

        const processed = Math.min(i + batch.length, valid.length)
        uploadProgress.value = 30 + Math.floor((processed / valid.length) * 30)
      }
    }
    uploadProgress.value = 65

    // 2. 체험단 적재
    if (sourceFile.value && parsedExpRows.value.length > 0) {
      const expData = preprocessExperiences(parsedExpRows.value)
      uploadProgress.value = 70

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
      uploadProgress.value = 80

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
          uploadProgress.value = 80 + Math.floor((processed / Math.max(dedupedRows.length, 1)) * 15)
        }
      }
    }
    uploadProgress.value = 95

    // 3. 결과 처리
    uploadResultStats.value = { orderNew, orderExcluded, expInserted }
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
        orderUploadDone: parsedOrderRows.value.length > 0,
        influencerUploadDone: parsedExpRows.value.length > 0,
        campaignLabel: campaignNameForLog,
        mappingPending: unmappedList.length,
        uploadStats: { orderNew, orderExcluded, expInserted },
        unmappedProducts: serializedUnmapped,
      })
      uploadResultTimestamp.value = getWorkflow(targetMonth).lastOrderUpload || ''
      toast.success('업로드가 완료되었습니다.')
    }, 300)
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
  }
}

function downloadTemplate(type: 'order' | 'influencer') {
  const wb = XLSX.utils.book_new()
  const isOrder = type === 'order'
  const headers = isOrder
    ? ['상품주문번호', '상품명', '상품번호', '옵션정보', '수량', '구매자명', '구매자ID', '수취인명', '주문일시', '주문상태', '클레임상태']
    : ['미션상품명', '옵션정보', '수취인명', '아이디', '구매인증일', '캠페인명']
  const sample = isOrder
    ? ['2025021200000001', '유산균 파우더 30포', 'P-1001', '기본', 1, '김지윤', 'kimj****', '김지윤', '2025-02-12 10:32', '결제완료', '없음']
    : ['유산균 파우더 30포', '기본', '김지윤', 'kimj****', '2025-02-12', '2025년 2월 블로그 체험단']
  const ws = XLSX.utils.aoa_to_sheet([headers, sample])
  XLSX.utils.book_append_sheet(wb, ws, isOrder ? '주문양식' : '체험단양식')
  XLSX.writeFile(wb, isOrder ? '주문업로드_예시양식.xlsx' : '체험단업로드_예시양식.xlsx')
}

const uploadResults = computed(() => {
  if (!hasResult.value) return []
  const s = uploadResultStats.value
  const timestamp = uploadResultTimestamp.value || '-'
  const r = []
  if (s.orderNew > 0) r.push({ time: timestamp, description: '주문 데이터 업로드 반영', count: s.orderNew, type: 'success' })
  if (s.expInserted > 0) r.push({ time: timestamp, description: '체험단 데이터 업로드 반영', count: s.expInserted, type: 'info' })
  if (s.orderExcluded > 0) r.push({ time: timestamp, description: '취소/반품 주문 제외 처리', count: s.orderExcluded, type: 'warning' })
  return r
})

watch(
  () => selectedMonth.value,
  async (month) => {
    const syncId = ++monthSyncSeq.value
    if (isUploading.value) return
    resetSourceFileState()
    uploadResultStats.value = { orderNew: 0, orderExcluded: 0, expInserted: 0 }

    if (month === 'all') { uploadState.value = 'empty'; mappingFailedItems.value = []; return }

    const wf = getWorkflow(month)
    inferredCampaignName.value = wf.campaignLabel === '미등록' ? '' : wf.campaignLabel
    uploadResultTimestamp.value = wf.lastOrderUpload !== '미업로드' ? wf.lastOrderUpload : ''

    let orderCount = 0
    let expCount = 0
    let dbChecked = false
    try {
      const counts = await fetchMonthUploadCounts(month)
      if (syncId !== monthSyncSeq.value) return
      orderCount = counts.orderCount
      expCount = counts.expCount
      dbChecked = true
    } catch (error) {
      console.warn('Failed to fetch upload counts for month:', month, error)
    }

    const hasDbUpload = dbChecked ? (orderCount > 0 || expCount > 0) : (wf.orderUploadDone || wf.influencerUploadDone)
    if (!hasDbUpload) {
      if (
        dbChecked
        && (
          wf.orderUploadDone
          || wf.influencerUploadDone
          || wf.mappingPending > 0
          || wf.uploadStats.orderNew > 0
          || wf.uploadStats.expInserted > 0
          || wf.uploadStats.orderExcluded > 0
          || wf.lastOrderUpload !== '미업로드'
        )
      ) {
        resetMonth(month)
      }
      mappingFailedItems.value = []
      uploadResultStats.value = { orderNew: 0, orderExcluded: 0, expInserted: 0 }
      uploadResultTimestamp.value = ''
      uploadState.value = 'empty'
      return
    }

    uploadResultStats.value = {
      orderNew: wf.uploadStats.orderNew > 0 ? wf.uploadStats.orderNew : orderCount,
      orderExcluded: wf.uploadStats.orderExcluded || 0,
      expInserted: wf.uploadStats.expInserted > 0 ? wf.uploadStats.expInserted : expCount,
    }
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

.mapping-search-wrap {
  position: relative;
  width: 260px;
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
}
</style>
