<template>
  <div class="customers-page">
    <!-- Filters Row -->
    <div class="card filter-bar">
      <div class="filter-row">
        <SearchInput v-model="searchQuery" placeholder="이름, ID 검색..." width="240px" />

        <select v-model="filterPetType" class="select">
          <option value="">펫 타입 전체</option>
          <option value="DOG">강아지</option>
          <option value="CAT">고양이</option>
          <option value="BOTH">모두</option>
        </select>

        <select v-model="filterStage" class="select">
          <option value="">성장 단계 전체</option>
          <option value="Entry">입문</option>
          <option value="Growth">성장</option>
          <option value="Premium">프리미엄</option>
        </select>

        <select v-model="filterChurn" class="select">
          <option value="">이탈 위험 전체</option>
          <option value="true">이탈 위험</option>
          <option value="false">정상</option>
        </select>

        <select v-model="filterPurchaseCount" class="select">
          <option value="">구매 횟수 전체</option>
          <option value="1">1회</option>
          <option value="2">2회 이상</option>
          <option value="3">3회 이상</option>
          <option value="5">5회 이상</option>
          <option value="10">10회 이상</option>
        </select>
      </div>

      <!-- Active filters -->
      <div v-if="activeFilters.length > 0" class="filter-chips mt-md">
        <div v-for="f in activeFilters" :key="f.key" class="filter-chip">
          <span>{{ f.label }}</span>
          <button class="filter-chip-remove" @click="clearFilter(f.key)">
            <X :size="10" :stroke-width="3" />
          </button>
        </div>
        <button class="btn btn-ghost btn-sm" @click="clearAllFilters">전체 초기화</button>
      </div>
    </div>

    <!-- Results -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">고객 목록</h3>
        <div class="flex gap-sm">
          <StatusBadge :label="selectedPeriodLabel" variant="neutral" />
          <Tooltip text="현재 필터 조건이 반영된 고객 목록을 엑셀로 저장합니다.">
            <button class="btn btn-secondary btn-sm" :disabled="loading" @click="downloadFilteredCustomers">
              <Download :size="14" :stroke-width="2" />
              엑셀 다운로드
            </button>
          </Tooltip>
        </div>
      </div>

      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>ID</th>
              <th>펫 타입</th>
              <th>성장 단계</th>
              <th>구매 횟수</th>
              <th>구매 상품 수</th>
              <th>최근 주문</th>
              <th>이탈 위험</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in pagedCustomers"
              :key="c.customerKey"
              class="clickable"
              @click="openCustomerDetail(c)"
            >
              <td class="font-medium">{{ c.name }}</td>
              <td style="font-family: var(--font-mono); font-size: 0.75rem;">{{ c.id }}</td>
              <td><StatusBadge :label="c.petType === 'DOG' ? '강아지' : c.petType === 'CAT' ? '고양이' : '모두'" :variant="c.petType === 'DOG' ? 'primary' : c.petType === 'CAT' ? 'warning' : 'neutral'" /></td>
              <td>
                <div class="stage-indicator">
                  <div class="stage-progress">
                    <div class="stage-fill" :style="{ width: stagePercent(c.stage) + '%' }"></div>
                  </div>
                  <span class="text-sm">{{ stageLabel(c.stage) }}</span>
                </div>
              </td>
              <td>{{ c.purchaseCount }}회</td>
              <td>{{ c.productCount }}개</td>
              <td class="text-sm text-secondary">{{ c.lastOrder }}</td>
              <td>
                <StatusBadge
                  v-if="c.churnRisk"
                  label="위험"
                  variant="danger"
                  dot
                />
                <span v-else class="text-sm text-muted">—</span>
              </td>
            </tr>
            <tr v-if="filteredCustomers.length === 0">
              <td colspan="8" class="empty-row">조건에 맞는 고객이 없습니다.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="pagination">
        <span class="pagination-info">{{ paginationInfoLabel }}</span>
        <div class="pagination-controls">
          <button class="pagination-btn" :disabled="currentPage <= 1" @click="goPrevPage">
            <ChevronLeft :size="14" :stroke-width="2" />
          </button>
          <button
            v-for="(item, idx) in paginationItems"
            :key="`page-${item}-${idx}`"
            class="pagination-btn"
            :class="{ active: typeof item === 'number' && item === currentPage }"
            :disabled="typeof item !== 'number'"
            @click="typeof item === 'number' ? goPage(item) : undefined"
          >
            {{ typeof item === 'number' ? item : '…' }}
          </button>
          <button class="pagination-btn" :disabled="currentPage >= totalPages" @click="goNextPage">
            <ChevronRight :size="14" :stroke-width="2" />
          </button>
        </div>
      </div>
    </div>

    <!-- Customer Detail Panel -->
    <SlidePanel v-model="showCustomerDetail" :title="selectedCustomer?.name || ''">
      <template v-if="selectedCustomer">
        <div class="detail-section">
          <div class="detail-section-title">기본 정보</div>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">이름</span>
              <span class="detail-value">{{ selectedCustomer.name }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">ID</span>
              <span class="detail-value" style="font-family: var(--font-mono);">{{ selectedCustomer.id }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">펫 타입</span>
              <StatusBadge :label="selectedCustomer.petType === 'DOG' ? '강아지' : selectedCustomer.petType === 'CAT' ? '고양이' : '모두'" :variant="selectedCustomer.petType === 'DOG' ? 'primary' : selectedCustomer.petType === 'CAT' ? 'warning' : 'neutral'" />
            </div>
            <div class="detail-item">
              <span class="detail-label">성장 단계</span>
              <span class="detail-value">{{ stageLabel(selectedCustomer.stage) }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">총 구매 횟수</span>
              <span class="detail-value">{{ selectedCustomer.purchaseCount }}회</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">총 구매 상품 수</span>
              <span class="detail-value">{{ selectedCustomer.productCount }}개</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">이탈 위험</span>
              <StatusBadge v-if="selectedCustomer.churnRisk" label="위험" variant="danger" dot />
              <span v-else class="detail-value">정상</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">구매 이력</div>
          <table class="data-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>상품</th>
                <th>옵션</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(order, i) in customerOrders" :key="i">
                <td class="text-sm">{{ order.date }}</td>
                <td class="text-sm">{{ order.product }}</td>
                <td class="text-sm">{{ order.optionInfo }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <template #footer>
        <div class="flex gap-sm">
          <button v-if="!isViewer" class="btn btn-primary btn-sm" disabled style="opacity: 0.4; cursor: not-allowed;">마케팅 대상 등록 (준비중)</button>
          <button class="btn btn-secondary btn-sm" @click="showCustomerDetail = false">닫기</button>
        </div>
      </template>
    </SlidePanel>
  </div>
</template>

<script setup lang="ts">
import {
  Download,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-vue-next'
import type { LocationQuery } from 'vue-router'
import * as XLSX from 'xlsx'
import { matchesSearchQuery } from '~/composables/useTextSearch'

type CustomerStage = 'Entry' | 'Growth' | 'Premium'

interface CustomerRow {
  customerKey: string
  name: string
  id: string
  buyerName: string
  buyerId: string
  petType: 'DOG' | 'CAT' | 'BOTH'
  stage: CustomerStage
  purchaseCount: number
  productCount: number
  lastOrder: string
  churnRisk: boolean
}

interface CustomerOrderRow {
  date: string
  product: string
  optionInfo: string
}

interface PurchaseRow {
  purchase_id: string
  customer_key: string
  buyer_name: string
  buyer_id: string
  product_id: string
  product_name: string
  order_date: string
  target_month: string
}

interface ProductMeta {
  pet_type: 'DOG' | 'CAT' | 'BOTH'
}

const supabase = useSupabaseClient()
const toast = useToast()
const { isViewer, profileLoaded, profileRevision } = useCurrentUser()
const { selectedMonth, selectedPeriodLabel, availableMonths, selectMonth } = useAnalysisPeriod()
const route = useRoute()
const router = useRouter()

const searchQuery = ref('')
const filterPetType = ref('')
const filterStage = ref('')
const filterChurn = ref('')
const filterPurchaseCount = ref('')
const showCustomerDetail = ref(false)
const selectedCustomer = ref<CustomerRow | null>(null)
const loading = ref(false)

const customers = ref<CustomerRow[]>([])
const customerOrders = ref<CustomerOrderRow[]>([])
const productMetaById = ref<Record<string, ProductMeta>>({})
const productPetTypeByName = ref<Record<string, ProductMeta['pet_type']>>({})
const PAGE_SIZE = 10
const DB_FETCH_PAGE_SIZE = 1000
const currentPage = ref(1)

function parseOrderDate(value: string): Date {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? new Date('1970-01-01') : d
}

function normalizeForMatch(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '')
}

function normalizeMissionProductName(rawName: string): string {
  const name = String(rawName || '').trim()
  if (!name) return ''

  const normalizedName = normalizeForMatch(name)
  const hasFreezeDried = normalizedName.includes('동결건조') || normalizedName.includes('동견건조')
  const hasAttachmentTreat = normalizedName.includes('애착트릿')
  if (hasFreezeDried && !hasAttachmentTreat) return '동결건조(리뉴얼전)'

  if (normalizedName.includes('애착트릿')) return '애착트릿'
  if (normalizedName.includes('츄라잇')) return '츄라잇'
  if (normalizedName.includes('케어푸')) return '케어푸'
  if (normalizedName.includes('두부모래')) return '두부모래'
  if (normalizedName.includes('이즈바이트')) return '이즈바이트'
  if (normalizedName.includes('엔자이츄')) return '엔자이츄'
  if (normalizedName.includes('트릿백')) return '미니 트릿백'
  if (normalizedName.includes('츄르짜개')) return '츄르짜개 (고양이 간식 디스펜서)'
  if (normalizedName.includes('도시락')) return '도시락 샘플팩'
  if (normalizedName.includes('맛보기')) return '전제품 맛보기 샘플'

  return name
}

function sanitizePetType(value: unknown): ProductMeta['pet_type'] {
  const type = String(value || '').toUpperCase()
  if (type === 'DOG') return 'DOG'
  if (type === 'CAT') return 'CAT'
  if (type === 'BOTH' || type === 'ALL') return 'BOTH'
  return 'BOTH'
}

function mergePetType(prev: ProductMeta['pet_type'] | undefined, next: ProductMeta['pet_type']): ProductMeta['pet_type'] {
  if (!prev) return next
  if (prev === next) return prev
  return 'BOTH'
}

function inferPetTypeFromName(productName: string): ProductMeta['pet_type'] {
  const normalized = normalizeForMatch(productName)
  const hasDog = normalized.includes('강아지') || normalized.includes('강견') || normalized.includes('견')
  const hasCat = normalized.includes('고양이') || normalized.includes('묘') || normalized.includes('냥')
  if (hasDog && hasCat) return 'BOTH'
  if (hasDog) return 'DOG'
  if (hasCat) return 'CAT'
  return 'BOTH'
}

function daysFromNow(dateStr: string): number {
  const ms = Date.now() - parseOrderDate(dateStr).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function deriveStageByCount(orderCount: number): CustomerStage {
  if (orderCount >= 5) return 'Premium'
  if (orderCount >= 4) return 'Growth'
  return 'Entry'
}

function derivePetType(rows: PurchaseRow[]): 'DOG' | 'CAT' | 'BOTH' {
  let hasDog = false
  let hasCat = false

  for (const row of rows) {
    const idKey = String(row.product_id || '').trim()
    const metaById = idKey ? productMetaById.value[idKey] : null
    const nameKey = normalizeForMatch(normalizeMissionProductName(row.product_name || ''))
    const petTypeFromName = nameKey ? productPetTypeByName.value[nameKey] : undefined
    const petType = metaById?.pet_type || petTypeFromName || inferPetTypeFromName(row.product_name || '')

    if (petType === 'BOTH') return 'BOTH'
    if (petType === 'DOG') hasDog = true
    if (petType === 'CAT') hasCat = true
    if (hasDog && hasCat) return 'BOTH'
  }

  if (hasDog) return 'DOG'
  if (hasCat) return 'CAT'
  return 'BOTH'
}

function purchaseDateKey(row: Pick<PurchaseRow, 'order_date'>): string {
  return String(row.order_date || '').slice(0, 10)
}

function purchaseItemKey(row: Pick<PurchaseRow, 'purchase_id' | 'order_date' | 'product_id' | 'product_name' | 'buyer_id' | 'buyer_name'>): string {
  const purchaseId = String(row.purchase_id || '').trim()
  if (purchaseId) return purchaseId
  return [
    String(row.order_date || '').slice(0, 10),
    String(row.product_id || '').trim(),
    String(row.product_name || '').trim(),
    String(row.buyer_id || '').trim(),
    String(row.buyer_name || '').trim(),
  ].join('|')
}

async function loadProductMeta() {
  const { data, error } = await supabase
    .from('products')
    .select('product_id, product_name, pet_type')
    .is('deleted_at', null)

  if (error) {
    console.error('Failed to load product meta:', error)
    return
  }

  const map: Record<string, ProductMeta> = {}
  const nameMap: Record<string, ProductMeta['pet_type']> = {}
  for (const row of (data || []) as any[]) {
    const petType = sanitizePetType(row.pet_type)
    map[String(row.product_id)] = {
      pet_type: petType,
    }

    const rawName = String(row.product_name || '').trim()
    const rawNameKey = normalizeForMatch(rawName)
    if (rawNameKey) {
      nameMap[rawNameKey] = mergePetType(nameMap[rawNameKey], petType)
    }

    const canonicalName = normalizeMissionProductName(rawName)
    const canonicalNameKey = normalizeForMatch(canonicalName)
    if (canonicalNameKey) {
      nameMap[canonicalNameKey] = mergePetType(nameMap[canonicalNameKey], petType)
    }
  }
  productMetaById.value = map
  productPetTypeByName.value = nameMap
}

async function fetchCustomers() {
  loading.value = true
  try {
    // 상품 관리에서 펫 타입이 수정된 뒤 재진입해도 최신 값을 반영하도록
    // 고객 집계 직전에 항상 상품 메타를 다시 조회한다.
    await loadProductMeta()

    const collected: any[] = []
    for (let from = 0; ; from += DB_FETCH_PAGE_SIZE) {
      let query = supabase
        .from('purchases')
        .select('purchase_id, customer_key, buyer_name, buyer_id, product_id, product_name, order_date, target_month')
        .not('filter_ver', 'is', null)
        .eq('is_fake', false)
        .eq('needs_review', false)
        .order('order_date', { ascending: false })
        .order('purchase_id', { ascending: false })
        .range(from, from + DB_FETCH_PAGE_SIZE - 1)

      if (selectedMonth.value !== 'all') query = query.eq('target_month', selectedMonth.value)

      const { data, error } = await query
      if (error) {
        console.error('Failed to fetch customers:', error)
        toast.error('고객 데이터를 불러오지 못했습니다.')
        return
      }

      const rows = data || []
      collected.push(...rows)
      if (rows.length < DB_FETCH_PAGE_SIZE) break
    }

    const rows = collected as PurchaseRow[]
    const grouped = new Map<string, PurchaseRow[]>()
    for (const row of rows) {
      const key = row.customer_key || `${row.buyer_id}_${row.buyer_name}`
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(row)
    }

    const result: CustomerRow[] = []
    for (const [customerKey, customerRows] of grouped.entries()) {
      const sorted = [...customerRows].sort((a, b) => parseOrderDate(b.order_date).getTime() - parseOrderDate(a.order_date).getTime())
      const latest = sorted[0]
      if (!latest) continue

      const purchaseCount = new Set(customerRows.map((row) => purchaseDateKey(row)).filter(Boolean)).size
      if (purchaseCount <= 0) continue
      const productCount = new Set(customerRows.map((row) => purchaseItemKey(row)).filter(Boolean)).size

      const lastOrder = String(latest.order_date || '').slice(0, 10)
      result.push({
        customerKey,
        name: latest.buyer_name || '-',
        id: latest.buyer_id || '-',
        buyerName: latest.buyer_name || '',
        buyerId: latest.buyer_id || '',
        petType: derivePetType(customerRows),
        stage: deriveStageByCount(purchaseCount),
        purchaseCount,
        productCount,
        lastOrder,
        churnRisk: daysFromNow(lastOrder) > 90,
      })
    }

    customers.value = result.sort((a, b) => parseOrderDate(b.lastOrder).getTime() - parseOrderDate(a.lastOrder).getTime())
  } finally {
    loading.value = false
  }
}

async function fetchCustomerOrders(customer: CustomerRow) {
  let query = supabase
    .from('purchases')
    .select('order_date, product_name, option_info, target_month')
    .not('filter_ver', 'is', null)
    .eq('is_fake', false)
    .eq('needs_review', false)
    .order('order_date', { ascending: false })
    .limit(100)

  if (selectedMonth.value !== 'all') query = query.eq('target_month', selectedMonth.value)

  if (customer.customerKey && customer.customerKey !== `${customer.buyerId}_${customer.buyerName}`) {
    query = query.eq('customer_key', customer.customerKey)
  } else if (customer.buyerId || customer.buyerName) {
    if (customer.buyerId) query = query.eq('buyer_id', customer.buyerId)
    if (customer.buyerName) query = query.eq('buyer_name', customer.buyerName)
  } else {
    customerOrders.value = []
    return
  }

  const { data, error } = await query
  if (error) {
    console.error('Failed to fetch customer orders:', error)
    customerOrders.value = []
    return
  }

  customerOrders.value = ((data || []) as any[]).map((row) => ({
    date: String(row.order_date || '').slice(0, 10),
    product: row.product_name || '-',
    optionInfo: String(row.option_info || '').trim() || '-',
  }))
}

const filteredCustomers = computed(() => {
  return customers.value.filter((c) => {
    if (!matchesSearchQuery(searchQuery.value, c.name, c.id, c.buyerName, c.buyerId)) return false
    if (filterPetType.value && c.petType !== filterPetType.value) return false
    if (filterStage.value && c.stage !== filterStage.value) return false
    if (filterChurn.value === 'true' && !c.churnRisk) return false
    if (filterChurn.value === 'false' && c.churnRisk) return false
    if (filterPurchaseCount.value) {
      const minCount = Number(filterPurchaseCount.value)
      if (Number.isFinite(minCount) && c.purchaseCount < minCount) return false
    }
    return true
  })
})

const totalPages = computed(() => {
  const total = filteredCustomers.value.length
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
})

const pagedCustomers = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredCustomers.value.slice(start, start + PAGE_SIZE)
})

const paginationInfoLabel = computed(() => {
  const total = filteredCustomers.value.length
  if (total === 0) return '총 0명'
  const start = (currentPage.value - 1) * PAGE_SIZE + 1
  const end = Math.min(start + PAGE_SIZE - 1, total)
  return `총 ${total}명 중 ${start}-${end}`
})

const paginationItems = computed<Array<number | string>>(() => {
  const total = totalPages.value
  const current = currentPage.value
  if (total <= 7) return Array.from({ length: total }, (_, idx) => idx + 1)

  const items: Array<number | string> = [1]
  let start = Math.max(2, current - 1)
  let end = Math.min(total - 1, current + 1)

  if (current <= 3) {
    start = 2
    end = 4
  } else if (current >= total - 2) {
    start = total - 3
    end = total - 1
  }

  if (start > 2) items.push('ellipsis-prev')
  for (let page = start; page <= end; page++) items.push(page)
  if (end < total - 1) items.push('ellipsis-next')

  items.push(total)
  return items
})

function goPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}

function goPrevPage() {
  goPage(currentPage.value - 1)
}

function goNextPage() {
  goPage(currentPage.value + 1)
}

const activeFilters = computed(() => {
  const filters: { key: string; label: string }[] = []
  if (searchQuery.value) filters.push({ key: 'search', label: `검색: ${searchQuery.value}` })
  const petMap: Record<string, string> = { DOG: '강아지', CAT: '고양이', BOTH: '모두' }
  if (filterPetType.value) filters.push({ key: 'petType', label: `펫: ${petMap[filterPetType.value]}` })
  const stageMap: Record<string, string> = { Entry: '입문', Growth: '성장', Premium: '프리미엄' }
  if (filterStage.value) filters.push({ key: 'stage', label: `단계: ${stageMap[filterStage.value]}` })
  if (filterChurn.value) filters.push({ key: 'churn', label: filterChurn.value === 'true' ? '이탈 위험' : '정상' })
  if (filterPurchaseCount.value) {
    const label = filterPurchaseCount.value === '1' ? '구매: 1회 이상' : `구매: ${filterPurchaseCount.value}회 이상`
    filters.push({ key: 'purchaseCount', label })
  }
  return filters
})

function clearFilter(key: string) {
  const map: Record<string, any> = {
    search: searchQuery,
    petType: filterPetType,
    stage: filterStage,
    churn: filterChurn,
    purchaseCount: filterPurchaseCount,
  }
  if (map[key]) map[key].value = ''
}

function clearAllFilters() {
  searchQuery.value = ''
  filterPetType.value = ''
  filterStage.value = ''
  filterChurn.value = ''
  filterPurchaseCount.value = ''
}

function stageLabel(stage: string) {
  const stageMap: Record<string, string> = { Entry: '입문', Growth: '성장', Premium: '프리미엄' }
  return stageMap[stage] || stage
}

function asSingleQueryValue(val: string | string[] | null | undefined): string {
  if (Array.isArray(val)) return val[0] || ''
  return val || ''
}

function applyFiltersFromQuery(query: LocationQuery) {
  searchQuery.value = asSingleQueryValue(query.q) || asSingleQueryValue(query.search)

  const month = asSingleQueryValue(query.month)
  const isValidMonth = month === 'all' || availableMonths.value.some((option) => option.value === month)
  if (isValidMonth && month !== selectedMonth.value) selectMonth(month)

  const pet = asSingleQueryValue(query.petType) || asSingleQueryValue(query.pet)
  filterPetType.value = pet === 'DOG' || pet === 'CAT' || pet === 'BOTH' ? pet : ''

  const stage = asSingleQueryValue(query.stage)
  if (stage === 'Core') {
    filterStage.value = 'Premium'
  } else {
    filterStage.value = stage === 'Entry' || stage === 'Growth' || stage === 'Premium' ? stage : ''
  }

  const churn = asSingleQueryValue(query.churn)
  filterChurn.value = churn === 'true' || churn === 'false' ? churn : ''

  const purchaseCount = asSingleQueryValue(query.purchaseCount) || asSingleQueryValue(query.purchase_count)
  filterPurchaseCount.value = ['1', '2', '3', '5', '10'].includes(purchaseCount) ? purchaseCount : ''
}

function normalizedQuery(query: LocationQuery) {
  const normalized: Record<string, string> = {}
  for (const [k, v] of Object.entries(query)) {
    const value = asSingleQueryValue(v)
    if (value) normalized[k] = value
  }
  return normalized
}

const managedKeys = new Set([
  'q',
  'search',
  'purchaseType',
  'is_fake',
  'petType',
  'pet',
  'stage',
  'churn',
  'month',
  'purchaseCount',
  'purchase_count',
])

function syncFiltersToQuery() {
  const current = normalizedQuery(route.query)
  const next: Record<string, string> = {}

  for (const [k, v] of Object.entries(current)) {
    if (!managedKeys.has(k)) next[k] = v
  }

  if (searchQuery.value.trim()) next.q = searchQuery.value.trim()
  if (filterPetType.value) next.petType = filterPetType.value
  if (filterStage.value) next.stage = filterStage.value
  if (filterChurn.value) next.churn = filterChurn.value
  if (selectedMonth.value !== 'all') next.month = selectedMonth.value
  if (filterPurchaseCount.value) next.purchaseCount = filterPurchaseCount.value

  const currentWithoutLegacy = { ...current }
  delete currentWithoutLegacy.search
  delete currentWithoutLegacy.pet
  delete currentWithoutLegacy.purchaseType
  delete currentWithoutLegacy.is_fake
  delete currentWithoutLegacy.purchase_count

  if (JSON.stringify(currentWithoutLegacy) !== JSON.stringify(next)) {
    router.replace({ query: next })
  }
}

watch(() => route.query, (query) => {
  applyFiltersFromQuery(query)
}, { immediate: true })

watch(
  () => availableMonths.value.length,
  (len, prev) => {
    if (len > 0 && len !== prev) {
      applyFiltersFromQuery(route.query)
    }
  },
)

watch(
  [searchQuery, filterPetType, filterStage, filterChurn, filterPurchaseCount, selectedMonth],
  () => {
    currentPage.value = 1
    syncFiltersToQuery()
  },
)

watch(
  () => filteredCustomers.value.length,
  () => {
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value
    }
  },
)

watch(
  () => [selectedMonth.value, profileLoaded.value, profileRevision.value],
  async ([month, loaded]) => {
    if (!month || !loaded) return
    await fetchCustomers()
    if (selectedCustomer.value) {
      await fetchCustomerOrders(selectedCustomer.value)
    }
  },
  { immediate: true },
)

function stagePercent(stage: string): number {
  const map: Record<string, number> = { Entry: 33, Growth: 66, Premium: 100 }
  return map[stage] || 0
}

async function openCustomerDetail(customer: CustomerRow) {
  selectedCustomer.value = customer
  showCustomerDetail.value = true
  await fetchCustomerOrders(customer)
}

function downloadFilteredCustomers() {
  const header = ['이름', 'ID', '펫타입', '성장단계', '구매횟수', '구매상품수', '최근주문', '이탈위험']
  const rows = filteredCustomers.value.map((c) => [
    c.name,
    c.id,
    c.petType === 'DOG' ? '강아지' : c.petType === 'CAT' ? '고양이' : '모두',
    stageLabel(c.stage),
    c.purchaseCount,
    c.productCount,
    c.lastOrder,
    c.churnRisk ? '위험' : '정상',
  ])
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  XLSX.utils.book_append_sheet(wb, ws, '고객분석')
  XLSX.writeFile(wb, `고객분석_${selectedMonth.value === 'all' ? 'all' : selectedMonth.value}.xlsx`)
}

onMounted(async () => {
  // 초기 메타 로드(안전망). 실제 고객 집계 시에도 loadProductMeta를 선행 호출한다.
  await loadProductMeta()
})
</script>
<style scoped>
.customers-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.filter-bar {
  padding: var(--space-lg) var(--space-xl);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.filter-row .select {
  min-width: 136px;
}

.filter-row :deep(.input-with-icon) {
  min-width: 240px;
  flex: 1 1 240px;
}

.stage-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.stage-progress {
  width: 48px;
  height: 4px;
  background: #F3F4F6;
  border-radius: 2px;
  overflow: hidden;
}

.stage-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 2px;
  transition: width 0.3s ease;
}

@media (max-width: 1024px) {
  .filter-bar {
    padding: var(--space-md) var(--space-lg);
  }

  .filter-row {
    gap: var(--space-sm);
  }

  .filter-row .select {
    flex: 1 1 calc(33.333% - var(--space-sm));
  }
}

@media (max-width: 768px) {
  .customers-page {
    gap: var(--space-lg);
  }

  .filter-bar {
    padding: var(--space-md);
  }

  .filter-row {
    align-items: stretch;
  }

  .filter-row :deep(.input-with-icon) {
    width: 100% !important;
    min-width: 0;
    flex: 1 1 100%;
  }

  .filter-row .select {
    min-width: 0;
    width: 100%;
    flex: 1 1 calc(50% - var(--space-sm));
  }

  .stage-indicator {
    gap: 6px;
  }

  .stage-progress {
    width: 40px;
  }
}
</style>
