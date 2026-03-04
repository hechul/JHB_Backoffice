<template>
  <div class="argo-page">
    <div v-if="isViewer" class="status-banner">
      <AlertTriangle :size="16" :stroke-width="2" />
      <span>열람자 권한에서는 변환/다운로드를 실행할 수 없습니다.</span>
    </div>

    <div class="page-header">
      <div>
        <h1 class="page-title">아르고 발주 변환</h1>
        <p class="page-subtitle">배송지 파일 여러 개를 한 번에 업로드해 아르고 발주 양식으로 통합 변환합니다.</p>
      </div>
      <NuxtLink to="/automation" class="btn btn-secondary btn-sm">자동화 홈</NuxtLink>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">
          <FileSpreadsheet :size="18" :stroke-width="1.8" style="color: var(--color-primary)" />
          배송지 파일 업로드 (다중 파일)
        </h3>
        <StatusBadge v-if="sourceFileItems.length > 0" :label="`파일 ${sourceFileItems.length}개`" variant="success" dot />
      </div>

      <div
        class="drop-zone"
        :class="{ 'drag-over': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="handleDrop"
        @click="triggerInput"
      >
        <Upload :size="30" :stroke-width="1.5" class="drop-zone-icon" />
        <span v-if="sourceFileItems.length === 0" class="text-sm text-secondary">
          .xlsx/.xls/.csv 파일을 여러 개 선택하거나 드래그하세요.
        </span>
        <div v-else class="file-selected">
          <span class="file-name">{{ sourceFileItems.length }}개 파일 선택됨</span>
          <button class="btn btn-ghost btn-sm" @click.stop="clearAllFiles">
            <X :size="14" :stroke-width="2" />
            전체 초기화
          </button>
        </div>
      </div>
      <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" multiple hidden @change="onFileSelected" />

      <div v-if="parsedFileItems.length > 0" class="file-list-block">
        <div class="file-list-title">업로드 파일 목록</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>파일명</th>
                <th>소스</th>
                <th>시트</th>
                <th>유효 행</th>
                <th>스킵 행</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in parsedFileItems" :key="item.key">
                <td>
                  <div class="file-cell">
                    <strong>{{ item.file.name }}</strong>
                    <span class="file-size">{{ formatSize(item.file.size) }}</span>
                  </div>
                </td>
                <td>{{ sourceTypeLabel(item.parsed.sourceType) }}</td>
                <td>{{ item.parsed.sheetName }}</td>
                <td>{{ item.parsed.rows.length }}</td>
                <td>{{ item.parsed.skippedRows }}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" @click.stop="removeFile(item.key)">
                    <X :size="14" :stroke-width="2" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="hint-grid">
        <div class="hint-row">
          <span class="hint-label">감지 소스</span>
          <span class="hint-value">{{ sourceSummaryLabel }}</span>
        </div>
        <div class="hint-row">
          <span class="hint-label">파일 수</span>
          <span class="hint-value">{{ parsedFileItems.length }}개</span>
        </div>
        <div class="hint-row">
          <span class="hint-label">원본 유효 행</span>
          <span class="hint-value">{{ totalValidRows }}건</span>
        </div>
        <div class="hint-row">
          <span class="hint-label">스킵 행</span>
          <span class="hint-value">{{ totalSkippedRows }}건</span>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-primary" :disabled="!canConvert || converting" @click="convertAndDownload">
          <Download :size="16" :stroke-width="2" />
          {{ converting ? '변환 중...' : '아르고 양식(통합) 다운로드' }}
        </button>
        <span v-if="convertBlockReason" class="text-sm text-danger">{{ convertBlockReason }}</span>
      </div>
    </div>

    <div v-if="editableRows.length > 0" class="card">
      <div class="card-header">
        <h3 class="card-title">사람별 상품/수량 입력</h3>
        <StatusBadge :label="`${editableRows.length}건`" variant="warning" dot />
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>파일</th>
              <th>원본 행</th>
              <th>수취인</th>
              <th>원본 품목 힌트</th>
              <th>상품명(직접입력)</th>
              <th>수량(직접입력)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, rowIndex) in editableRows" :key="item.key">
              <td>{{ item.fileName }}</td>
              <td>{{ item.row.rowIndex }}</td>
              <td>{{ item.row.receiverName }}</td>
              <td>{{ item.row.productHint || '-' }}</td>
              <td>
                <input
                  v-model.trim="item.manualProductName"
                  class="file-input"
                  :list="`argo-row-product-list-${rowIndex}`"
                  placeholder="예: 이즈바이트 버블 덴탈껌"
                />
                <datalist :id="`argo-row-product-list-${rowIndex}`">
                  <option v-for="code in productCodes" :key="`${item.key}-${code.key}`" :value="code.label" />
                </datalist>
              </td>
              <td>
                <input
                  v-model.number="item.manualQuantity"
                  class="file-input quantity"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="1"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="hasResult" class="card">
      <div class="card-header">
        <h3 class="card-title">변환 결과</h3>
        <StatusBadge :label="`${resultOrders.length}건 생성`" variant="success" dot />
      </div>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="summary-label">원본 유효 행</span>
          <strong>{{ totalValidRows }}</strong>
        </div>
        <div class="summary-item">
          <span class="summary-label">양식 생성 행</span>
          <strong>{{ resultOrders.length }}</strong>
        </div>
        <div class="summary-item">
          <span class="summary-label">미해결 행</span>
          <strong>{{ unresolvedRows.length }}</strong>
        </div>
      </div>
      <p class="text-xs text-muted mt-sm">최종 다운로드: {{ lastDownloadAt || '-' }}</p>
    </div>

    <div v-if="resultOrders.length > 0" class="card">
      <div class="card-header">
        <h3 class="card-title">생성 미리보기 (상위 20건)</h3>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>주문번호</th>
              <th>수취인명</th>
              <th>주소</th>
              <th>우편번호</th>
              <th>상품바코드</th>
              <th>수량</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in previewOrders" :key="row['주문번호(*)']">
              <td>{{ row['주문번호(*)'] }}</td>
              <td>{{ row['수취인명(*)'] }}</td>
              <td>{{ row['수취인주소(*)'] }}</td>
              <td>{{ row['수취인 우편번호(*)'] }}</td>
              <td>{{ row['상품바코드(*)'] }}</td>
              <td>{{ row['상품수량(*)'] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="unresolvedRows.length > 0" class="card">
      <div class="card-header">
        <h3 class="card-title">
          <AlertTriangle :size="16" :stroke-width="2" style="color: var(--color-warning)" />
          미해결 행
        </h3>
        <StatusBadge :label="`${unresolvedRows.length}건`" variant="warning" />
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>파일</th>
              <th>원본 행</th>
              <th>수취인</th>
              <th>품목 힌트</th>
              <th>사유</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in unresolvedRows" :key="`${row.fileName}-${row.rowIndex}-${row.receiverName}`">
              <td>{{ row.fileName }}</td>
              <td>{{ row.rowIndex }}</td>
              <td>{{ row.receiverName }}</td>
              <td>{{ row.productHint || '-' }}</td>
              <td>{{ row.reason }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Upload,
  X,
  AlertTriangle,
  FileSpreadsheet,
  Download,
} from 'lucide-vue-next'
import StatusBadge from '~/components/StatusBadge.vue'
import {
  buildArgoOrders,
  collectAddressesWithoutPostcode,
  downloadArgoWorkbook,
  getArgoProductCodes,
  parseShippingFile,
  resolveArgoProductKeyFromInput,
  type ArgoOrderRow,
  type ParsedShippingRow,
  type ParsedShippingFile,
  type ShippingSourceType,
  type UnresolvedShippingRow,
} from '~/composables/useArgoOrderConverter'

definePageMeta({ layout: 'home' })

interface PostcodeLookupResponse {
  postcodes?: Record<string, string>
  unresolved?: string[]
  meta?: {
    provider?: 'kakao' | 'none'
    keyConfigured?: boolean
    attempted?: number
    success?: number
    rateLimited?: number
  }
}

interface ParsedFileItem {
  key: string
  file: File
  parsed: ParsedShippingFile
}

interface EditableShippingRow {
  key: string
  fileKey: string
  fileName: string
  row: ParsedShippingRow
  manualProductName: string
  manualQuantity: number
}

interface UnresolvedRowWithFile extends UnresolvedShippingRow {
  fileName: string
}

const toast = useToast()
const { isViewer, canModify } = useCurrentUser()

const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const parsing = ref(false)
const converting = ref(false)
const parsedFileItems = ref<ParsedFileItem[]>([])
const editableRows = ref<EditableShippingRow[]>([])
const resultOrders = ref<ArgoOrderRow[]>([])
const unresolvedRows = ref<UnresolvedRowWithFile[]>([])
const lastDownloadAt = ref('')

const productCodes = getArgoProductCodes()

const sourceFileItems = computed(() => parsedFileItems.value.map((item) => item.file))

const totalValidRows = computed(() => parsedFileItems.value.reduce((sum, item) => sum + item.parsed.rows.length, 0))
const totalSkippedRows = computed(() => parsedFileItems.value.reduce((sum, item) => sum + item.parsed.skippedRows, 0))

const sourceSummaryLabel = computed(() => {
  if (parsedFileItems.value.length === 0) return '-'
  const counts = { dinner: 0, reviewnote: 0, unknown: 0 }
  for (const item of parsedFileItems.value) {
    if (item.parsed.sourceType === 'dinner') counts.dinner += 1
    else if (item.parsed.sourceType === 'reviewnote') counts.reviewnote += 1
    else counts.unknown += 1
  }
  const chunks: string[] = []
  if (counts.dinner > 0) chunks.push(`디너의여왕 ${counts.dinner}`)
  if (counts.reviewnote > 0) chunks.push(`리뷰노트 ${counts.reviewnote}`)
  if (counts.unknown > 0) chunks.push(`미확인 ${counts.unknown}`)
  return chunks.join(' / ')
})

function hasValidEditableRow(item: EditableShippingRow): boolean {
  const productKey = resolveArgoProductKeyFromInput(item.manualProductName || '')
  const qty = Number(item.manualQuantity)
  return Boolean(productKey) && Number.isFinite(qty) && qty > 0
}

const canConvert = computed(() => {
  if (!canModify.value) return false
  if (parsedFileItems.value.length === 0) return false
  if (editableRows.value.length === 0) return false
  if (parsing.value || converting.value) return false
  if (editableRows.value.some((item) => !hasValidEditableRow(item))) return false
  return true
})

const convertBlockReason = computed(() => {
  if (!canModify.value) return '열람자 권한에서는 변환을 실행할 수 없습니다.'
  if (parsedFileItems.value.length === 0) return '배송지 파일을 먼저 업로드해 주세요.'
  if (editableRows.value.length === 0) return '변환 가능한 배송지 행이 없습니다.'
  if (parsing.value) return '파일을 분석 중입니다.'
  if (editableRows.value.some((item) => !resolveArgoProductKeyFromInput(item.manualProductName || ''))) return '사람별 상품명을 입력해 주세요.'
  if (editableRows.value.some((item) => !Number.isFinite(Number(item.manualQuantity)) || Number(item.manualQuantity) <= 0)) return '사람별 수량은 1 이상으로 입력해 주세요.'
  return ''
})

const hasResult = computed(() => resultOrders.value.length > 0 || unresolvedRows.value.length > 0)
const previewOrders = computed(() => resultOrders.value.slice(0, 20))

function normalizeText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^0-9a-z가-힣]/g, '')
}

function sourceTypeLabel(sourceType: ShippingSourceType): string {
  if (sourceType === 'dinner') return '디너의여왕'
  if (sourceType === 'reviewnote') return '리뷰노트'
  return '미확인'
}

function fileKey(file: File): string {
  return `${file.name}__${file.size}__${file.lastModified}`
}

function dedupeFiles(files: File[]): File[] {
  const map = new Map<string, File>()
  for (const file of files) {
    map.set(fileKey(file), file)
  }
  return Array.from(map.values())
}

function guessDefaultProductKeyFromHint(hint: string): string {
  const normalized = normalizeText(hint)
  if (!normalized) return ''
  if (normalized.includes('엔자이츄')) return '엔자이츄 츄잉 덴탈껌'
  if (normalized.includes('이즈바이트')) return '이즈바이트 버블 덴탈껌'
  if (normalized.includes('두부모래')) return '두부모래'
  if (normalized.includes('케어푸') || normalized.includes('포스트바이오틱스')) return '케어푸 포스트바이오틱스'
  return ''
}

function defaultQuantityBySource(sourceType: ShippingSourceType, productKey: string): number {
  if (sourceType === 'dinner' && productKey === '두부모래') return 2
  return 1
}

function triggerInput() {
  fileInput.value?.click()
}

function clearAllFiles() {
  parsedFileItems.value = []
  editableRows.value = []
  resultOrders.value = []
  unresolvedRows.value = []
  lastDownloadAt.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

function removeFile(key: string) {
  parsedFileItems.value = parsedFileItems.value.filter((item) => item.key !== key)
  editableRows.value = editableRows.value.filter((item) => item.fileKey !== key)
  resultOrders.value = []
  unresolvedRows.value = []
  lastDownloadAt.value = ''
}

function formatSize(size: number): string {
  if (!size || size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function rowKey(fileKeyValue: string, row: ParsedShippingRow): string {
  return `${fileKeyValue}::${row.rowIndex}::${normalizeText(row.receiverName)}::${normalizeText(row.address)}`
}

function buildEditableRows(nextFiles: ParsedFileItem[], previousRows: EditableShippingRow[]): EditableShippingRow[] {
  const previousMap = new Map<string, EditableShippingRow>()
  for (const prev of previousRows) previousMap.set(prev.key, prev)

  const nextRows: EditableShippingRow[] = []
  for (const fileItem of nextFiles) {
    for (const row of fileItem.parsed.rows) {
      const key = rowKey(fileItem.key, row)
      const prev = previousMap.get(key)
      const guessedProductName = guessDefaultProductKeyFromHint(row.productHint || fileItem.parsed.fallbackProductHint)
      const manualProductName = prev?.manualProductName || guessedProductName
      const resolvedProductKey = resolveArgoProductKeyFromInput(manualProductName || '') || guessedProductName
      const fallbackQty = defaultQuantityBySource(row.sourceType, resolvedProductKey)
      const prevQty = Number(prev?.manualQuantity)

      nextRows.push({
        key,
        fileKey: fileItem.key,
        fileName: fileItem.file.name,
        row,
        manualProductName,
        manualQuantity: Number.isFinite(prevQty) && prevQty > 0 ? Math.floor(prevQty) : fallbackQty,
      })
    }
  }
  return nextRows
}

async function loadFiles(files: File[]) {
  const incoming = files.filter((file) => /\.(xlsx|xls|csv)$/i.test(file.name))
  if (incoming.length === 0) {
    toast.error('지원 형식(.xlsx/.xls/.csv) 파일을 선택해 주세요.')
    return
  }

  parsing.value = true
  resultOrders.value = []
  unresolvedRows.value = []
  lastDownloadAt.value = ''

  try {
    const nextFiles = dedupeFiles([...sourceFileItems.value, ...incoming])
    const nextItems: ParsedFileItem[] = []
    let failed = 0

    for (const file of nextFiles) {
      try {
        const parsed = await parseShippingFile(file)
        nextItems.push({
          key: fileKey(file),
          file,
          parsed,
        })
      } catch (error) {
        failed += 1
        console.error('[argo file parse failed]', file.name, error)
      }
    }

    parsedFileItems.value = nextItems
    editableRows.value = buildEditableRows(nextItems, editableRows.value)

    toast.success(`파일 분석 완료: ${nextItems.length}개 파일, ${editableRows.value.length}건`)
    if (failed > 0) {
      toast.warning(`분석 실패 파일 ${failed}개는 제외되었습니다.`)
    }
  } finally {
    parsing.value = false
  }
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length === 0) return
  void loadFiles(files)
  input.value = ''
}

function handleDrop(event: DragEvent) {
  dragOver.value = false
  const files = Array.from(event.dataTransfer?.files || [])
  if (files.length === 0) return
  void loadFiles(files)
}

async function lookupPostcodesIfNeeded() {
  const allRows = editableRows.value.map((item) => item.row)
  const missingAddresses = collectAddressesWithoutPostcode(allRows)
  if (missingAddresses.length === 0) return {}

  const response = await $fetch<PostcodeLookupResponse>('/api/postcode/lookup', {
    method: 'POST',
    body: {
      addresses: missingAddresses,
    },
  })

  const unresolvedCount = response?.unresolved?.length || 0
  const meta = response?.meta
  if (meta?.keyConfigured === false) {
    toast.error('우편번호 자동조회 키가 설정되지 않았습니다. KAKAO_REST_API_KEY를 확인해 주세요.')
    return response?.postcodes || {}
  }
  if ((meta?.attempted || 0) > 0 && (meta?.success || 0) === 0) {
    toast.warning('우편번호 조회 응답이 없습니다. 주소 형식 또는 API 키 권한을 확인해 주세요.')
  }
  if ((meta?.rateLimited || 0) > 0) {
    toast.warning(`우편번호 조회 중 호출 제한이 감지되었습니다(${meta?.rateLimited}회). 잠시 후 재시도해 주세요.`)
  }
  if (unresolvedCount > 0) {
    toast.warning(`우편번호 자동조회 실패 ${unresolvedCount}건은 미해결로 표시됩니다.`)
  }
  return response?.postcodes || {}
}

function formatTimestamp(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function formatFileSuffix(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}${mm}${dd}_${hh}${mi}`
}

async function convertAndDownload() {
  if (editableRows.value.length === 0) return
  converting.value = true
  try {
    const postcodeByAddress = await lookupPostcodesIfNeeded()

    const mergedOrders: ArgoOrderRow[] = []
    const mergedUnresolved: UnresolvedRowWithFile[] = []
    let sequence = 1

    for (const item of editableRows.value) {
      const forcedProductKey = resolveArgoProductKeyFromInput(item.manualProductName || '')
      if (!forcedProductKey) {
        mergedUnresolved.push({
          fileName: item.fileName,
          rowIndex: item.row.rowIndex,
          receiverName: item.row.receiverName,
          productHint: item.row.productHint || '-',
          reason: '직접 입력한 상품명을 제품코드로 매핑하지 못함',
        })
        continue
      }
      const forcedQuantity = Math.max(1, Math.floor(Number(item.manualQuantity) || 1))
      const result = buildArgoOrders([item.row], {
        forceProductKey: forcedProductKey,
        forceQuantity: forcedQuantity,
        postcodeByAddress,
        sequenceStart: sequence,
      })

      sequence += result.orders.length
      mergedOrders.push(...result.orders)
      mergedUnresolved.push(
        ...result.unresolvedRows.map((row) => ({
          ...row,
          fileName: item.fileName,
        })),
      )
    }

    resultOrders.value = mergedOrders
    unresolvedRows.value = mergedUnresolved

    if (mergedOrders.length > 0) {
      const now = new Date()
      const filename = `아르고_발주_통합_${formatFileSuffix(now)}.xlsx`
      downloadArgoWorkbook(mergedOrders, filename)
      lastDownloadAt.value = formatTimestamp(now)
      toast.success(`아르고 발주 양식 ${mergedOrders.length}건 다운로드 완료`)
    } else {
      toast.warning('생성 가능한 행이 없습니다. 미해결 항목을 확인해 주세요.')
    }
  } catch (error) {
    console.error(error)
    toast.error('변환 중 오류가 발생했습니다.')
  } finally {
    converting.value = false
  }
}
</script>

<style scoped>
.argo-page {
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

.drop-zone {
  border: 1px dashed #D1D5DB;
  border-radius: var(--radius-lg);
  padding: var(--space-2xl);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  background: #FCFCFD;
  transition: all 0.16s ease;
  cursor: pointer;
}

.drop-zone.drag-over {
  border-color: var(--color-primary);
  background: #F8FAFF;
}

.drop-zone-icon {
  color: var(--color-text-muted);
}

.file-selected {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
  justify-content: center;
}

.file-list-block {
  margin-top: var(--space-lg);
}

.file-list-title {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-bottom: var(--space-sm);
}

.file-input {
  width: 240px;
  max-width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 6px 8px;
  font-size: 0.75rem;
  background: var(--color-surface);
  color: var(--color-text);
}

.file-input.quantity {
  width: 90px;
}

.file-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
}

.file-size {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.hint-grid {
  margin-top: var(--space-lg);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm) var(--space-lg);
}

.hint-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.hint-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.hint-value {
  font-size: 0.8125rem;
  color: var(--color-text);
  font-weight: 500;
}

.actions {
  margin-top: var(--space-lg);
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-md);
}

.summary-item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #FCFCFD;
}

.summary-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.summary-item strong {
  font-size: 1rem;
  color: var(--color-text);
}

.mt-sm {
  margin-top: var(--space-sm);
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .hint-grid {
    grid-template-columns: 1fr;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
