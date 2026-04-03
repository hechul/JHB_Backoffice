<template>
  <div class="customers-page">
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">고객 분석</h1>
        <span class="page-caption">실구매 고객 중심</span>
      </div>
      <div class="page-header-actions">
        <StatusBadge :label="selectedPeriodLabel" variant="neutral" />
      </div>
    </div>

    <div class="customer-summary-grid">
      <div class="customer-summary-card">
        <span class="customer-summary-label">신규 고객</span>
        <strong class="customer-summary-value">{{ customerOverviewMetrics.entryCustomers.toLocaleString() }}명</strong>
        <span class="customer-summary-meta">구매 1회</span>
      </div>
      <div class="customer-summary-card">
        <span class="customer-summary-label">재구매 고객</span>
        <strong class="customer-summary-value">{{ customerOverviewMetrics.repeatCustomers.toLocaleString() }}명</strong>
        <span class="customer-summary-meta">구매 2회 이상</span>
      </div>
      <div class="customer-summary-card">
        <span class="customer-summary-label">고객당 주문수</span>
        <strong class="customer-summary-value">{{ customerOverviewMetrics.ordersPerCustomer }}</strong>
        <span class="customer-summary-meta">현재 조건 기준</span>
      </div>
      <div class="customer-summary-card">
        <span class="customer-summary-label">조회 고객</span>
        <strong class="customer-summary-value">{{ filteredCustomers.length.toLocaleString() }}명</strong>
        <span class="customer-summary-meta">{{ selectedPeriodLabel }}</span>
      </div>
    </div>

    <div class="filter-bar">
      <div class="filter-row">
        <SearchInput v-model="searchQuery" placeholder="이름, ID 검색..." width="240px" />
        <SearchInput v-model="filterProductName" placeholder="상품명 검색..." width="240px" />

        <select v-model="filterSourceChannel" class="select">
          <option value="">채널 전체</option>
          <option value="naver">네이버</option>
          <option value="coupang">쿠팡</option>
          <option value="excel">엑셀</option>
        </select>

        <select v-model="filterPetType" class="select">
          <option value="">펫 타입 전체</option>
          <option value="DOG">강아지</option>
          <option value="CAT">고양이</option>
          <option value="BOTH">모두</option>
        </select>

        <select v-model="filterChurn" class="select">
          <option value="">이탈 위험 전체</option>
          <option value="true">이탈 위험</option>
          <option value="false">정상</option>
          <option value="excluded">판단 제외</option>
        </select>

        <select v-model="filterPurchaseCount" class="select">
          <option value="">구매 횟수 전체</option>
          <option value="1">1회</option>
          <option value="2">2회 이상</option>
          <option value="3">3회 이상</option>
          <option value="5">5회 이상</option>
          <option value="10">10회 이상</option>
        </select>
        <button class="btn btn-secondary btn-sm filter-toggle-btn" @click="showAdvancedFilters = !showAdvancedFilters">
          {{ showAdvancedFilterPanel ? '상세 필터 접기' : '상세 필터' }}
        </button>
      </div>

      <div v-if="showAdvancedFilterPanel" class="filter-row filter-row-advanced">
        <select v-model="filterStage" class="select">
          <option value="">성장 단계 전체</option>
          <option value="Entry">신규</option>
          <option value="Growth">성장</option>
          <option value="Premium">단골</option>
          <option value="Core">핵심</option>
        </select>

        <select v-model="filterPurchaseIntensity" class="select">
          <option value="">구매 강도 전체</option>
          <option value="Dormant">휴면</option>
          <option value="Low">낮음</option>
          <option value="Medium">보통</option>
          <option value="High">높음</option>
          <option value="VeryHigh">매우 높음</option>
        </select>

        <select v-if="selectedMonth !== 'all'" v-model="filterWeek" class="select">
          <option value="">주차 전체</option>
          <option v-for="week in weekOptions" :key="week.value" :value="week.value">{{ week.label }}</option>
        </select>

        <input v-model="filterOrderDate" type="date" class="input date-input" />
      </div>

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
              <th>고객</th>
              <th>펫 타입</th>
              <th>성장 단계</th>
              <th>구매 강도</th>
              <th>구매</th>
              <th v-if="hasProductFilter">검색상품 구매횟수</th>
              <th>구매 흐름</th>
              <th>현재 상태</th>
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
              <td>
                <div class="customer-table-identity">
                  <strong>{{ c.name }}</strong>
                  <span>{{ c.id }}</span>
                  <div class="customer-source-badges">
                    <StatusBadge
                      v-for="label in customerSourceScopeLabels(c)"
                      :key="`${c.customerKey}-${label}`"
                      :label="label"
                      variant="neutral"
                    />
                  </div>
                </div>
              </td>
              <td><StatusBadge :label="c.petType === 'DOG' ? '강아지' : c.petType === 'CAT' ? '고양이' : '모두'" :variant="c.petType === 'DOG' ? 'primary' : c.petType === 'CAT' ? 'warning' : 'neutral'" /></td>
              <td class="text-sm text-secondary">{{ stageLabel(c.stage) }}</td>
              <td>
                <StatusBadge :label="intensityLabel(c.purchaseIntensity)" :variant="intensityVariant(c.purchaseIntensity)" />
              </td>
              <td class="customer-table-purchase">{{ c.purchaseCount }}회 · {{ formatQuantityCount(c.productCount) }}개</td>
              <td v-if="hasProductFilter">{{ matchingProductPurchaseCount(c) }}회</td>
              <td>
                <div class="customer-table-flow">
                  <span>{{ currentPurchaseDate(c) }}</span>
                  <span>최근 {{ c.lastOrder }}</span>
                </div>
              </td>
              <td>
                <StatusBadge
                  :label="c.currentOrderStatus"
                  :variant="orderStatusBadgeVariant(c.currentOrderStatusCode, c.currentClaimStatusCode)"
                />
              </td>
              <td>
                <StatusBadge
                  :label="churnLabel(c.churnStatus)"
                  :variant="churnVariant(c.churnStatus)"
                  :dot="isRiskChurn(c.churnStatus)"
                />
              </td>
            </tr>
            <tr v-if="filteredCustomers.length === 0">
              <td :colspan="hasProductFilter ? 9 : 8" class="empty-row">조건에 맞는 고객이 없습니다.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="customer-card-list">
        <div
          v-for="c in pagedCustomers"
          :key="`mobile-${c.customerKey}`"
          class="customer-mobile-card clickable"
          @click="openCustomerDetail(c)"
        >
          <div class="customer-mobile-head">
            <div class="customer-mobile-title">
              <strong>{{ c.name }}</strong>
              <span class="customer-mobile-id">{{ c.id }}</span>
              <div class="customer-source-badges">
                <StatusBadge
                  v-for="label in customerSourceScopeLabels(c)"
                  :key="`mobile-${c.customerKey}-${label}`"
                  :label="label"
                  variant="neutral"
                />
              </div>
            </div>
            <StatusBadge
              :label="c.petType === 'DOG' ? '강아지' : c.petType === 'CAT' ? '고양이' : '모두'"
              :variant="c.petType === 'DOG' ? 'primary' : c.petType === 'CAT' ? 'warning' : 'neutral'"
            />
          </div>

          <div class="customer-mobile-grid">
            <div class="customer-mobile-item">
              <span class="customer-mobile-label">성장 단계</span>
              <span class="customer-mobile-value">{{ stageLabel(c.stage) }}</span>
            </div>
            <div class="customer-mobile-item">
              <span class="customer-mobile-label">구매 강도</span>
              <StatusBadge :label="intensityLabel(c.purchaseIntensity)" :variant="intensityVariant(c.purchaseIntensity)" />
            </div>
            <div class="customer-mobile-item">
              <span class="customer-mobile-label">구매</span>
              <span class="customer-mobile-value">{{ c.purchaseCount }}회 · {{ formatQuantityCount(c.productCount) }}개</span>
            </div>
            <div v-if="hasProductFilter" class="customer-mobile-item">
              <span class="customer-mobile-label">검색상품 구매횟수</span>
              <span class="customer-mobile-value">{{ matchingProductPurchaseCount(c) }}회</span>
            </div>
            <div class="customer-mobile-item">
              <span class="customer-mobile-label">구매 흐름</span>
              <span class="customer-mobile-value customer-mobile-muted">{{ currentPurchaseDate(c) }} · 최근 {{ c.lastOrder }}</span>
            </div>
            <div class="customer-mobile-item">
              <span class="customer-mobile-label">현재 상태</span>
              <StatusBadge
                :label="c.currentOrderStatus"
                :variant="orderStatusBadgeVariant(c.currentOrderStatusCode, c.currentClaimStatusCode)"
              />
            </div>
            <div class="customer-mobile-item">
              <span class="customer-mobile-label">이탈 위험</span>
              <StatusBadge
                :label="churnLabel(c.churnStatus)"
                :variant="churnVariant(c.churnStatus)"
                :dot="isRiskChurn(c.churnStatus)"
              />
            </div>
          </div>
        </div>

        <div v-if="filteredCustomers.length === 0" class="customer-card-empty">
          조건에 맞는 고객이 없습니다.
        </div>
      </div>

      <!-- 페이지네이션 -->
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
              <span class="detail-label">구매 강도</span>
              <span class="detail-value">{{ intensityLabel(selectedCustomer.purchaseIntensity) }} (최근 90일 {{ selectedCustomer.recentPurchaseDayCount }}일)</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">누적 구매월</span>
              <span class="detail-value">{{ selectedCustomer.purchaseMonthCount }}개월</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">총 구매 횟수</span>
              <span class="detail-value">{{ selectedCustomer.purchaseCount }}회</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">총 구매 상품 수</span>
              <span class="detail-value">{{ formatQuantityCount(selectedCustomer.productCount) }}개</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">현재 상태</span>
              <StatusBadge
                :label="selectedCustomer.currentOrderStatus"
                :variant="orderStatusBadgeVariant(selectedCustomer.currentOrderStatusCode, selectedCustomer.currentClaimStatusCode)"
              />
            </div>
            <div class="detail-item">
              <span class="detail-label">주문 채널</span>
              <div class="detail-value detail-value-stack">
                <StatusBadge
                  v-for="label in customerSourceScopeLabels(selectedCustomer)"
                  :key="`detail-${selectedCustomer.customerKey}-${label}`"
                  :label="label"
                  variant="neutral"
                />
              </div>
            </div>
            <div class="detail-item">
              <span class="detail-label">이탈 위험</span>
              <div class="detail-value detail-value-stack">
                <StatusBadge
                  :label="churnLabel(selectedCustomer.churnStatus)"
                  :variant="churnVariant(selectedCustomer.churnStatus)"
                  :dot="isRiskChurn(selectedCustomer.churnStatus)"
                />
                <span v-if="hasExpectedConsumptionConfig && selectedCustomer.churnExpectedConsumptionDays">
                  기준 {{ selectedCustomer.churnExpectedConsumptionDays }}일 / 현재 {{ selectedCustomer.daysSinceLastOrder }}일 경과
                </span>
                <span v-else>
                  예상 소비일 미입력 상품만 최근 구매해 현재는 판단하지 않습니다.
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">구매 타임라인</div>
          <table class="data-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>채널</th>
                <th>유형</th>
                <th>상품</th>
                <th>옵션</th>
                <th>상태</th>
                <th>상품 개수</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(order, i) in customerOrders" :key="i">
                <td class="text-sm">{{ order.date }}</td>
                <td class="text-sm">{{ order.sourceChannelLabel }}</td>
                <td class="text-sm">{{ order.sourceFulfillmentLabel }}</td>
                <td class="text-sm">{{ order.product }}</td>
                <td class="text-sm">{{ order.optionInfo }}</td>
                <td class="text-sm">
                  <StatusBadge :label="order.status" :variant="orderStatusBadgeVariant(order.orderStatus, order.claimStatus)" />
                </td>
                <td class="text-sm">{{ formatQuantityCount(order.itemCount) }}개</td>
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
import {
  computeCustomerStage,
  computePurchaseIntensity,
  countDistinctPurchaseMonths,
  countRecentPurchaseDays,
  customerStageLabel,
  customerStagePercent,
  purchaseIntensityBadgeVariant,
  purchaseIntensityLabel,
  type PurchaseIntensityCode,
} from '~/composables/useGrowthStage'
import {
  computeChurnRisk,
  normalizeExpectedConsumptionDays,
  churnStatusBadgeVariant,
  churnStatusLabel,
  type ChurnStatusCode,
} from '~/composables/useChurnRisk'
import { matchesSearchQuery } from '~/composables/useTextSearch'
import { formatOrderStatusLabel, orderStatusBadgeVariant } from '~/composables/useOrderStatusLabel'
import { computePurchaseQuantity, formatQuantityCount } from '~/composables/usePurchaseQuantity'
import {
  normalizePurchaseSourceScope,
  purchaseQuantityInput,
  purchaseSelectColumns,
  purchaseSourceScopeSelectColumns,
  supportsPurchaseSourceColumns,
  supportsPurchaseSourceScopeColumns,
  type PurchaseSourceScope,
} from '~/composables/usePurchaseSourceFields'
import { buildWeekOptions, weekCodeFromDate, weekLabelFromCode } from '~/composables/useWeekFilter'

type CustomerStage = 'Entry' | 'Growth' | 'Premium' | 'Core' | 'Other'

interface CustomerProductStat {
  key: string
  name: string
  purchaseCount: number
  totalQuantity: number
  lastOrder: string
}

interface CustomerRow {
  customerKey: string
  name: string
  id: string
  buyerName: string
  buyerId: string
  petType: 'DOG' | 'CAT' | 'BOTH'
  stage: CustomerStage
  purchaseMonthCount: number
  purchaseIntensity: PurchaseIntensityCode
  recentPurchaseDayCount: number
  purchaseCount: number
  productCount: number
  lastOrder: string
  currentOrderStatus: string
  currentOrderStatusCode: string
  currentClaimStatusCode: string
  daysSinceLastOrder: number
  churnRisk: boolean
  churnStatus: ChurnStatusCode
  churnExpectedConsumptionDays: number | null
  productStats: CustomerProductStat[]
  purchaseWeeks: string[]
  purchaseDates: string[]
  sourceScopes: PurchaseSourceScope[]
}

interface CustomerOrderRow {
  date: string
  sourceChannel: string
  sourceChannelLabel: string
  sourceFulfillmentType: string
  sourceFulfillmentLabel: string
  product: string
  optionInfo: string
  status: string
  orderStatus: string
  claimStatus: string
  itemCount: number
}

interface PurchaseRow {
  purchase_id: string
  customer_key: string
  buyer_name: string
  buyer_id: string
  product_id: string
  product_name: string
  option_info: string
  source_product_name?: string
  source_option_info?: string
  source_channel?: string | null
  source_fulfillment_type?: string | null
  quantity: number
  order_date: string
  target_month: string
  order_status: string | null
  claim_status: string | null
}

interface ProductMeta {
  pet_type: 'DOG' | 'CAT' | 'BOTH'
  stage: number | null
  expected_consumption_days: number | null
}

const supabase = useSupabaseClient()
const toast = useToast()
const { isViewer, profileLoaded, profileRevision } = useCurrentUser()
const { selectedMonth, selectedPeriodLabel, availableMonths, selectMonth } = useAnalysisPeriod()
const route = useRoute()
const router = useRouter()

// 고객현황 화면 필터 상태
const searchQuery = ref('')
const filterPetType = ref('')
const filterStage = ref('')
const filterPurchaseIntensity = ref('')
const filterChurn = ref('')
const filterPurchaseCount = ref('')
const filterProductName = ref('')
const filterSourceChannel = ref('')
const filterWeek = ref('')
const filterOrderDate = ref('')
const showAdvancedFilters = ref(false)
const syncingFromQuery = ref(false)
const showCustomerDetail = ref(false)
const selectedCustomer = ref<CustomerRow | null>(null)
const loading = ref(false)
const customersFetchSeq = ref(0)
const customerOrdersFetchSeq = ref(0)

// 이 화면의 핵심 원본/가공 상태
// - customers: 고객 단위로 다시 묶은 결과
// - customerOrders: 상세 패널에서 한 명의 주문 이력
// - customerPurchaseRows: 현재 월 범위에서 읽은 purchases 원본
const customers = ref<CustomerRow[]>([])
const customerOrders = ref<CustomerOrderRow[]>([])
const customerPurchaseRows = ref<PurchaseRow[]>([])
const productMetaById = ref<Record<string, ProductMeta>>({})
const productMetaByName = ref<Record<string, ProductMeta>>({})
const hasExpectedConsumptionConfig = ref(false)
const PAGE_SIZE = 10
const DB_FETCH_PAGE_SIZE = 1000
const currentPage = ref(1)

// 현재 월에서 선택 가능한 주차 목록
const weekOptions = computed(() => {
  if (selectedMonth.value === 'all') return []
  return buildWeekOptions(selectedMonth.value)
})

// 날짜/상품명/펫 타입 정규화 보조 함수들
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

// products 메타를 화면 친화적으로 쓰기 위한 정리 함수
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

function mergeProductMeta(prev: ProductMeta | undefined, next: ProductMeta): ProductMeta {
  return {
    pet_type: mergePetType(prev?.pet_type, next.pet_type),
    stage: Math.max(prev?.stage || 0, next.stage || 0) || null,
    expected_consumption_days: Math.max(prev?.expected_consumption_days || 0, next.expected_consumption_days || 0) || null,
  }
}

// 상품 메타가 없을 때 상품명 자체에서 펫 타입을 추론한다.
function inferPetTypeFromName(productName: string): ProductMeta['pet_type'] {
  const normalized = normalizeForMatch(productName)
  const hasDog = normalized.includes('강아지') || normalized.includes('강견') || normalized.includes('견')
  const hasCat = normalized.includes('고양이') || normalized.includes('묘') || normalized.includes('냥')
  if (hasDog && hasCat) return 'BOTH'
  if (hasDog) return 'DOG'
  if (hasCat) return 'CAT'
  return 'BOTH'
}

// 한 고객이 산 모든 상품을 보고 대표 펫 타입을 정한다.
function derivePetType(rows: PurchaseRow[]): 'DOG' | 'CAT' | 'BOTH' {
  let hasDog = false
  let hasCat = false

  for (const row of rows) {
    const idKey = String(row.product_id || '').trim()
    const metaById = idKey ? productMetaById.value[idKey] : null
    const nameKey = normalizeForMatch(normalizeMissionProductName(row.product_name || ''))
    const petTypeFromName = nameKey ? productMetaByName.value[nameKey]?.pet_type : undefined
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

// 고객 성장 단계는 구매가 몇 개월에 걸쳐 이어졌는가를 기준으로 계산한다.
function deriveStage(rows: PurchaseRow[]): CustomerStage {
  const dates = [...new Set(rows.map((row) => purchaseDateKey(row)).filter(Boolean))].sort()
  if (!dates.length) return 'Other'
  return computeCustomerStage(countDistinctPurchaseMonths(dates))
}

// 이탈 위험 계산에 필요한 expected_consumption_days lookup
function resolveExpectedConsumptionDays(row: Pick<PurchaseRow, 'product_id' | 'product_name'>): number | null {
  const idKey = String(row.product_id || '').trim()
  const metaById = idKey ? productMetaById.value[idKey] : null
  if (metaById?.expected_consumption_days) return metaById.expected_consumption_days

  const nameKey = normalizeForMatch(normalizeMissionProductName(row.product_name || ''))
  const metaByName = nameKey ? productMetaByName.value[nameKey] : null
  return metaByName?.expected_consumption_days ?? null
}

// 고객 화면에서 말하는 "구매 강도"는 최근 구매일수/구매월수를 다시 계산한 값이다.
function derivePurchaseIntensity(rows: PurchaseRow[]): { purchaseMonthCount: number; recentPurchaseDayCount: number; purchaseIntensity: PurchaseIntensityCode } {
  const dates = [...new Set(rows.map((row) => purchaseDateKey(row)).filter(Boolean))].sort()
  const purchaseMonthCount = countDistinctPurchaseMonths(dates)
  const recentPurchaseDayCount = countRecentPurchaseDays(dates)
  return {
    purchaseMonthCount,
    recentPurchaseDayCount,
    purchaseIntensity: computePurchaseIntensity(recentPurchaseDayCount),
  }
}

// 고객 통계에서 날짜/상품 그룹핑용 키
function purchaseDateKey(row: Pick<PurchaseRow, 'order_date'>): string {
  return String(row.order_date || '').slice(0, 10)
}

function productGroupKey(row: Pick<PurchaseRow, 'product_id' | 'product_name'>): string {
  const productId = String(row.product_id || '').trim()
  if (productId) return `id:${productId}`

  const canonicalName = normalizeMissionProductName(String(row.product_name || ''))
  const normalized = normalizeForMatch(canonicalName || String(row.product_name || ''))
  if (normalized) return `name:${normalized}`
  return `raw:${String(row.product_name || '').trim()}`
}

// 고객 한 명이 어떤 상품을 몇 번, 얼마나 샀는지 상세 통계를 만든다.
function buildCustomerProductStats(rows: PurchaseRow[]): CustomerProductStat[] {
  const statMap = new Map<string, { name: string; dates: Set<string>; totalQuantity: number; lastOrder: string }>()

  for (const row of rows) {
    const key = productGroupKey(row)
    const displayName = normalizeMissionProductName(String(row.product_name || '').trim()) || String(row.product_name || '').trim() || '-'
    const date = purchaseDateKey(row)
    const totalQuantity = computePurchaseQuantity(purchaseQuantityInput(row)).totalCount

    if (!statMap.has(key)) {
      statMap.set(key, {
        name: displayName,
        dates: new Set<string>(),
        totalQuantity: 0,
        lastOrder: date,
      })
    }

    const stat = statMap.get(key)!
    if (date) stat.dates.add(date)
    stat.totalQuantity += totalQuantity
    if (parseOrderDate(date).getTime() > parseOrderDate(stat.lastOrder).getTime()) {
      stat.lastOrder = date
    }
    if (!stat.name || stat.name === '-') stat.name = displayName
  }

  return Array.from(statMap.entries())
    .map(([key, stat]) => ({
      key,
      name: stat.name || '-',
      purchaseCount: stat.dates.size,
      totalQuantity: stat.totalQuantity,
      lastOrder: stat.lastOrder,
    }))
    .sort((a, b) => parseOrderDate(b.lastOrder).getTime() - parseOrderDate(a.lastOrder).getTime())
}

function sourceChannelLabel(channel: string): string {
  if (channel === 'naver') return '네이버'
  if (channel === 'coupang') return '쿠팡'
  if (channel === 'excel') return '엑셀'
  return channel || '-'
}

function sourceFulfillmentLabel(channel: string, fulfillmentType: string): string {
  if (channel !== 'coupang') return '-'
  if (fulfillmentType === 'marketplace') return '판매자배송'
  if (fulfillmentType === 'rocket_growth') return '로켓그로스'
  return fulfillmentType || '-'
}

function customerSourceScopeLabels(customer: CustomerRow): string[] {
  return Array.from(new Set(
    customer.sourceScopes.map((scope) => sourceChannelLabel(scope.sourceChannel)),
  ))
}

function rowMatchesSourceFilters(row: Pick<PurchaseRow, 'source_channel' | 'source_fulfillment_type'>): boolean {
  const scope = normalizePurchaseSourceScope(row)
  if (filterSourceChannel.value && scope.sourceChannel !== filterSourceChannel.value) return false
  return true
}

// 원본 값 대신 정규화된 상품명/옵션을 보여주기 위한 표시 함수
function purchaseDisplayProductName(
  row: Pick<PurchaseRow, 'product_name' | 'source_product_name'>,
): string {
  const rawName = String(row.source_product_name || row.product_name || '').trim()
  return normalizeMissionProductName(rawName) || rawName || '-'
}

function purchaseDisplayOptionInfo(
  row: Pick<PurchaseRow, 'option_info' | 'source_option_info'>,
): string {
  return String(row.source_option_info || row.option_info || '').trim() || '-'
}

// 배지 라벨/색상은 공용 유틸을 감싸서 쓴다.
function intensityLabel(intensity: PurchaseIntensityCode | string) {
  return purchaseIntensityLabel(intensity)
}

function intensityVariant(intensity: PurchaseIntensityCode | string) {
  return purchaseIntensityBadgeVariant(intensity)
}

function effectiveChurnStatus(status: ChurnStatusCode | string): ChurnStatusCode {
  if (!hasExpectedConsumptionConfig.value) return 'Excluded'
  return status === 'Risk' || status === 'Normal' || status === 'Excluded'
    ? status
    : 'Excluded'
}

function churnLabel(status: ChurnStatusCode | string) {
  return churnStatusLabel(effectiveChurnStatus(status))
}

function churnVariant(status: ChurnStatusCode | string) {
  return churnStatusBadgeVariant(effectiveChurnStatus(status))
}

function isRiskChurn(status: ChurnStatusCode | string) {
  return effectiveChurnStatus(status) === 'Risk'
}

// expected_consumption_days 설정이 없는 환경에서는
// 이탈 위험 계산 결과를 강제로 Excluded 처리한다.
function applyChurnConfigGuardToCustomers() {
  if (hasExpectedConsumptionConfig.value) return
  if (!customers.value.length) return

  customers.value = customers.value.map((customer) => ({
    ...customer,
    churnRisk: false,
    churnStatus: 'Excluded',
    churnExpectedConsumptionDays: null,
  }))

  if (selectedCustomer.value) {
    const nextSelected = customers.value.find((customer) => customer.customerKey === selectedCustomer.value?.customerKey) || null
    selectedCustomer.value = nextSelected
  }
}

// products 메타 lookup 재조회
async function loadProductMeta() {
  const { data, error } = await supabase
    .from('products')
    .select('product_id, product_name, pet_type, stage, expected_consumption_days')
    .is('deleted_at', null)

  if (error) {
    productMetaById.value = {}
    productMetaByName.value = {}
    hasExpectedConsumptionConfig.value = false
    console.error('Failed to load product meta:', error)
    return
  }

  const map: Record<string, ProductMeta> = {}
  const nameMap: Record<string, ProductMeta> = {}
  let hasConfiguredExpectedConsumptionDays = false
  for (const row of (data || []) as any[]) {
    const petType = sanitizePetType(row.pet_type)
    const stage = Number.isFinite(Number(row.stage)) ? Number(row.stage) : null
    const expectedConsumptionDays = normalizeExpectedConsumptionDays(row.expected_consumption_days)
    if (expectedConsumptionDays !== null) hasConfiguredExpectedConsumptionDays = true
    const meta: ProductMeta = {
      pet_type: petType,
      stage,
      expected_consumption_days: expectedConsumptionDays,
    }
    map[String(row.product_id)] = {
      pet_type: petType,
      stage,
      expected_consumption_days: expectedConsumptionDays,
    }

    const rawName = String(row.product_name || '').trim()
    const rawNameKey = normalizeForMatch(rawName)
    if (rawNameKey) {
      nameMap[rawNameKey] = mergeProductMeta(nameMap[rawNameKey], meta)
    }

    const canonicalName = normalizeMissionProductName(rawName)
    const canonicalNameKey = normalizeForMatch(canonicalName)
    if (canonicalNameKey) {
      nameMap[canonicalNameKey] = mergeProductMeta(nameMap[canonicalNameKey], meta)
    }
  }
  productMetaById.value = map
  productMetaByName.value = nameMap
  hasExpectedConsumptionConfig.value = hasConfiguredExpectedConsumptionDays
}

// 고객현황의 원본 조회 시작점
// 1) products 메타 재조회
// 2) purchases 읽기
// 3) 월 범위에 맞게 scopeRows 자르기
// 4) 고객 단위로 다시 그룹핑
async function fetchCustomers() {
  const requestSeq = ++customersFetchSeq.value
  const monthSnapshot = selectedMonth.value
  loading.value = true
  try {
    // 상품 관리에서 펫 타입이 수정된 뒤 재진입해도 최신 값을 반영하도록
    // 고객 집계 직전에 항상 상품 메타를 다시 조회한다.
    await loadProductMeta()

    const collected: any[] = []
    const includeSourceColumns = await supportsPurchaseSourceColumns(supabase)
    const includeSourceScopeColumns = await supportsPurchaseSourceScopeColumns(supabase)
    const baseColumns = 'purchase_id, customer_key, buyer_name, buyer_id, product_id, product_name, option_info, quantity, order_date, target_month, order_status, claim_status'
    for (let from = 0; ; from += DB_FETCH_PAGE_SIZE) {
      const query = supabase
        .from('purchases')
        .select(
          purchaseSourceScopeSelectColumns(
            purchaseSelectColumns(baseColumns, includeSourceColumns),
            includeSourceScopeColumns,
          ),
        )
        .not('filter_ver', 'is', null)
        .eq('is_fake', false)
        .eq('needs_review', false)
        .order('order_date', { ascending: false })
        .order('purchase_id', { ascending: false })
        .range(from, from + DB_FETCH_PAGE_SIZE - 1)

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
    const scopeRows = monthSnapshot === 'all'
      ? rows
      : rows.filter((row) => row.target_month === monthSnapshot)

    if (requestSeq === customersFetchSeq.value) {
      customerPurchaseRows.value = scopeRows
    }

    const groupedAll = new Map<string, PurchaseRow[]>()
    for (const row of rows) {
      const key = row.customer_key || `${row.buyer_id}_${row.buyer_name}`
      if (!groupedAll.has(key)) groupedAll.set(key, [])
      groupedAll.get(key)!.push(row)
    }

    const grouped = new Map<string, PurchaseRow[]>()
    for (const row of scopeRows) {
      const key = row.customer_key || `${row.buyer_id}_${row.buyer_name}`
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(row)
    }

    const result: CustomerRow[] = []
    for (const [customerKey, customerRows] of grouped.entries()) {
      const historyRows = groupedAll.get(customerKey) || customerRows
      const sorted = [...customerRows].sort((a, b) => parseOrderDate(b.order_date).getTime() - parseOrderDate(a.order_date).getTime())
      const historySorted = [...historyRows].sort((a, b) => parseOrderDate(b.order_date).getTime() - parseOrderDate(a.order_date).getTime())
      const latest = sorted[0]
      const latestHistory = historySorted[0] || latest
      const sourceScopes = Array.from(new Map(
        historyRows.map((row) => {
          const scope = normalizePurchaseSourceScope(row)
          return [`${scope.sourceChannel}:${scope.sourceFulfillmentType}`, scope]
        }),
      ).values())
      if (!latest) continue

      const purchaseCount = new Set(customerRows.map((row) => purchaseDateKey(row)).filter(Boolean)).size
      if (purchaseCount <= 0) continue
      const productCount = customerRows.reduce((sum, row) => {
        const count = computePurchaseQuantity(purchaseQuantityInput(row)).totalCount
        return sum + count
      }, 0)
      const productStats = buildCustomerProductStats(customerRows)
      const lifecycle = derivePurchaseIntensity(historyRows)
      const churn = computeChurnRisk(historyRows.map((row) => ({
        orderDate: row.order_date,
        expectedConsumptionDays: hasExpectedConsumptionConfig.value ? resolveExpectedConsumptionDays(row) : null,
      })))

      result.push({
        customerKey,
        name: latest.buyer_name || '-',
        id: latest.buyer_id || '-',
        buyerName: latest.buyer_name || '',
        buyerId: latest.buyer_id || '',
        petType: derivePetType(historyRows),
        stage: deriveStage(historyRows),
        purchaseMonthCount: lifecycle.purchaseMonthCount,
        purchaseIntensity: lifecycle.purchaseIntensity,
        recentPurchaseDayCount: lifecycle.recentPurchaseDayCount,
        purchaseCount,
        productCount,
        lastOrder: churn.lastOrderDate || String(latest.order_date || '').slice(0, 10),
        currentOrderStatus: formatOrderStatusLabel(latestHistory?.order_status, latestHistory?.claim_status),
        currentOrderStatusCode: String(latestHistory?.order_status || ''),
        currentClaimStatusCode: String(latestHistory?.claim_status || ''),
        daysSinceLastOrder: churn.daysSinceLastOrder,
        churnRisk: churn.churnRisk,
        churnStatus: churn.status,
        churnExpectedConsumptionDays: churn.expectedConsumptionDays,
        productStats,
        purchaseWeeks: Array.from(new Set(customerRows.map((row) => (
          monthSnapshot !== 'all'
            ? weekCodeFromDate(row.order_date, monthSnapshot)
            : weekCodeFromDate(row.order_date)
        )).filter(Boolean))).sort(),
        purchaseDates: Array.from(new Set(customerRows.map((row) => purchaseDateKey(row)).filter(Boolean))).sort(),
        sourceScopes,
      })
    }

    if (requestSeq !== customersFetchSeq.value) return
    customers.value = result.sort((a, b) => parseOrderDate(b.lastOrder).getTime() - parseOrderDate(a.lastOrder).getTime())
  } finally {
    if (requestSeq === customersFetchSeq.value) {
      loading.value = false
    }
  }
}

// 우측 상세 패널에서 한 고객의 주문 이력을 다시 읽는다.
// 고객 목록은 고객 단위 요약이고, 이 함수는 주문 단위 세부 내역을 담당한다.
async function fetchCustomerOrders(customer: CustomerRow) {
  const requestSeq = ++customerOrdersFetchSeq.value
  const monthSnapshot = selectedMonth.value
  const weekSnapshot = filterWeek.value
  const orderDateSnapshot = filterOrderDate.value
  const includeSourceColumns = await supportsPurchaseSourceColumns(supabase)
  const includeSourceScopeColumns = await supportsPurchaseSourceScopeColumns(supabase)
  const baseColumns = 'order_date, product_name, option_info, quantity, target_month, order_status, claim_status'
  let query = supabase
    .from('purchases')
    .select(
      purchaseSourceScopeSelectColumns(
        purchaseSelectColumns(baseColumns, includeSourceColumns),
        includeSourceScopeColumns,
      ),
    )
        .not('filter_ver', 'is', null)
        .eq('is_fake', false)
        .eq('needs_review', false)
    .order('order_date', { ascending: false })
    .limit(100)

  if (monthSnapshot !== 'all') query = query.eq('target_month', monthSnapshot)

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
    if (requestSeq === customerOrdersFetchSeq.value) {
      customerOrders.value = []
    }
    return
  }

  const orders = ((data || []) as any[]).map((row) => {
    const scope = normalizePurchaseSourceScope(row)
    return {
      date: String(row.order_date || '').slice(0, 10),
      sourceChannel: scope.sourceChannel,
      sourceChannelLabel: sourceChannelLabel(scope.sourceChannel),
      sourceFulfillmentType: scope.sourceFulfillmentType,
      sourceFulfillmentLabel: sourceFulfillmentLabel(scope.sourceChannel, scope.sourceFulfillmentType),
      product: row.product_name || '-',
      optionInfo: String(row.option_info || '').trim() || '-',
      status: formatOrderStatusLabel(row.order_status, row.claim_status),
      orderStatus: String(row.order_status || ''),
      claimStatus: String(row.claim_status || ''),
      itemCount: computePurchaseQuantity(purchaseQuantityInput({
        product_name: String(row.product_name || ''),
        option_info: String(row.option_info || ''),
        source_product_name: String(row.source_product_name || ''),
        source_option_info: String(row.source_option_info || ''),
        quantity: Number(row.quantity) || 1,
      })).totalCount,
    }
  })

  if (requestSeq !== customerOrdersFetchSeq.value) return

  let filteredOrders = orders
  if (monthSnapshot !== 'all' && weekSnapshot) {
    filteredOrders = filteredOrders.filter((order) => weekCodeFromDate(order.date, monthSnapshot) === weekSnapshot)
  }
  if (orderDateSnapshot) {
    filteredOrders = filteredOrders.filter((order) => order.date === orderDateSnapshot)
  }
  if (filterSourceChannel.value) {
    filteredOrders = filteredOrders.filter((order) => order.sourceChannel === filterSourceChannel.value)
  }

  customerOrders.value = filteredOrders
}

// 상품명 검색이 켜져 있는지 여부
const hasProductFilter = computed(() => Boolean(filterProductName.value.trim()))

const showAdvancedFilterPanel = computed(() => {
  return showAdvancedFilters.value
    || Boolean(filterStage.value || filterPurchaseIntensity.value || filterWeek.value || filterOrderDate.value)
})

// 상단 KPI 카드 계산
const customerOverviewMetrics = computed(() => {
  const totalCustomers = filteredCustomers.value.length
  const repeatCustomers = filteredCustomers.value.filter((customer) => customer.purchaseCount >= 2).length
  const entryCustomers = filteredCustomers.value.filter((customer) => customer.purchaseCount === 1).length
  const totalOrders = filteredCustomers.value.reduce((sum, customer) => sum + customer.purchaseCount, 0)
  const ordersPerCustomer = totalCustomers > 0
    ? (Math.round((totalOrders / totalCustomers) * 10) / 10).toFixed(1)
    : '0.0'

  return {
    totalCustomers,
    repeatCustomers,
    entryCustomers,
    ordersPerCustomer,
  }
})

// 현재 상품 필터와 실제로 맞는 고객별 상품 통계만 뽑는다.
function matchedProductStats(customer: CustomerRow): CustomerProductStat[] {
  const query = filterProductName.value.trim()
  if (!query) return []
  return customer.productStats.filter((stat) => matchesSearchQuery(query, stat.name))
}

function matchingProductPurchaseCount(customer: CustomerRow): number {
  return matchedProductStats(customer).reduce((sum, stat) => sum + stat.purchaseCount, 0)
}

// 화면에 실제로 보이는 고객 목록
// 모든 필터가 최종적으로 이 computed 안에서 적용된다.
const filteredCustomers = computed(() => {
  return customers.value.filter((c) => {
    if (!matchesSearchQuery(searchQuery.value, c.name, c.id, c.buyerName, c.buyerId, stageLabel(c.stage), intensityLabel(c.purchaseIntensity), churnLabel(c.churnStatus), ...customerSourceScopeLabels(c))) return false
    if (hasProductFilter.value) {
      if (matchedProductStats(c).length === 0) return false
    }
    if (filterSourceChannel.value && !c.sourceScopes.some((scope) => scope.sourceChannel === filterSourceChannel.value)) return false
    if (filterPetType.value && c.petType !== filterPetType.value) return false
    if (filterStage.value && c.stage !== filterStage.value) return false
    if (filterPurchaseIntensity.value && c.purchaseIntensity !== filterPurchaseIntensity.value) return false
    const churnStatus = effectiveChurnStatus(c.churnStatus)
    if (filterChurn.value === 'true' && churnStatus !== 'Risk') return false
    if (filterChurn.value === 'false' && churnStatus !== 'Normal') return false
    if (filterChurn.value === 'excluded' && churnStatus !== 'Excluded') return false
    if (filterPurchaseCount.value) {
      const minCount = Number(filterPurchaseCount.value)
      if (Number.isFinite(minCount) && c.purchaseCount < minCount) return false
    }
    if (filterWeek.value && !c.purchaseWeeks.includes(filterWeek.value)) return false
    if (filterOrderDate.value && !c.purchaseDates.includes(filterOrderDate.value)) return false
    return true
  })
})

// 현재 필터 조건(주차/날짜/상품)에 걸리는 "현재 구매 날짜"를 다시 계산한다.
// 최근 주문과 달리, 지금 검색 범위 안에서의 날짜라는 점이 중요하다.
const currentPurchaseDateByCustomer = computed(() => {
  const result = new Map<string, string>()
  const productQuery = filterProductName.value.trim()

  for (const row of customerPurchaseRows.value) {
    if (!rowMatchesSourceFilters(row)) continue
    if (filterWeek.value && selectedMonth.value !== 'all' && weekCodeFromDate(row.order_date, selectedMonth.value) !== filterWeek.value) continue
    if (filterOrderDate.value && purchaseDateKey(row) !== filterOrderDate.value) continue
    if (productQuery && !matchesSearchQuery(productQuery, purchaseDisplayProductName(row), row.product_name, row.source_product_name)) continue

    const customerKey = row.customer_key || `${row.buyer_id}_${row.buyer_name}`
    const date = purchaseDateKey(row)
    if (!date) continue

    const current = result.get(customerKey)
    if (!current || parseOrderDate(date).getTime() > parseOrderDate(current).getTime()) {
      result.set(customerKey, date)
    }
  }

  return result
})

function currentPurchaseDate(customer: CustomerRow): string {
  return currentPurchaseDateByCustomer.value.get(customer.customerKey) || customer.lastOrder
}

// 페이지네이션 관련 계산
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

// 현재 화면에서 실제로 적용 중인 필터를 칩용 데이터로 변환한다.
const activeFilters = computed(() => {
  const filters: { key: string; label: string }[] = []
  if (searchQuery.value) filters.push({ key: 'search', label: `검색: ${searchQuery.value}` })
  if (filterProductName.value) filters.push({ key: 'productName', label: `상품: ${filterProductName.value}` })
  if (filterSourceChannel.value) filters.push({ key: 'sourceChannel', label: `채널: ${sourceChannelLabel(filterSourceChannel.value)}` })
  const petMap: Record<string, string> = { DOG: '강아지', CAT: '고양이', BOTH: '모두' }
  if (filterPetType.value) filters.push({ key: 'petType', label: `펫: ${petMap[filterPetType.value]}` })
  if (filterStage.value) filters.push({ key: 'stage', label: `단계: ${customerStageLabel(filterStage.value)}` })
  if (filterPurchaseIntensity.value) filters.push({ key: 'purchaseIntensity', label: `강도: ${intensityLabel(filterPurchaseIntensity.value as PurchaseIntensityCode)}` })
  if (filterChurn.value) {
    const churnMap: Record<string, string> = { true: '이탈 위험', false: '정상', excluded: '판단 제외' }
    filters.push({ key: 'churn', label: churnMap[filterChurn.value] || '이탈 위험' })
  }
  if (filterPurchaseCount.value) {
    const label = filterPurchaseCount.value === '1' ? '구매: 1회 이상' : `구매: ${filterPurchaseCount.value}회 이상`
    filters.push({ key: 'purchaseCount', label })
  }
  if (filterWeek.value && selectedMonth.value !== 'all') {
    filters.push({ key: 'week', label: `주차: ${weekLabelFromCode(selectedMonth.value, filterWeek.value)}` })
  }
  if (filterOrderDate.value) {
    filters.push({ key: 'orderDate', label: `구매일: ${filterOrderDate.value}` })
  }
  return filters
})

// 칩 하나만 제거 / 전체 제거
function clearFilter(key: string) {
  const map: Record<string, any> = {
    search: searchQuery,
    productName: filterProductName,
    sourceChannel: filterSourceChannel,
    petType: filterPetType,
    stage: filterStage,
    purchaseIntensity: filterPurchaseIntensity,
    churn: filterChurn,
    purchaseCount: filterPurchaseCount,
    week: filterWeek,
    orderDate: filterOrderDate,
  }
  if (map[key]) map[key].value = ''
}

function clearAllFilters() {
  searchQuery.value = ''
  filterProductName.value = ''
  filterSourceChannel.value = ''
  filterPetType.value = ''
  filterStage.value = ''
  filterPurchaseIntensity.value = ''
  filterChurn.value = ''
  filterPurchaseCount.value = ''
  filterWeek.value = ''
  filterOrderDate.value = ''
}

function stageLabel(stage: string) {
  return customerStageLabel(stage)
}

// URL query <-> 화면 필터 동기화용 보조 함수들
function asSingleQueryValue(val: string | string[] | null | undefined): string {
  if (Array.isArray(val)) return val[0] || ''
  return val || ''
}

function applyFiltersFromQuery(query: LocationQuery) {
  syncingFromQuery.value = true
  searchQuery.value = asSingleQueryValue(query.q) || asSingleQueryValue(query.search)
  filterProductName.value = asSingleQueryValue(query.product) || asSingleQueryValue(query.productName)

  const sourceChannel = asSingleQueryValue(query.sourceChannel) || asSingleQueryValue(query.channel)
  filterSourceChannel.value = sourceChannel === 'naver' || sourceChannel === 'coupang' || sourceChannel === 'excel' ? sourceChannel : ''

  const month = asSingleQueryValue(query.month)
  const isValidMonth = month === 'all' || availableMonths.value.some((option) => option.value === month)
  if (isValidMonth && month !== selectedMonth.value) selectMonth(month)

  const pet = asSingleQueryValue(query.petType) || asSingleQueryValue(query.pet)
  filterPetType.value = pet === 'DOG' || pet === 'CAT' || pet === 'BOTH' ? pet : ''

  const stage = asSingleQueryValue(query.stage)
  filterStage.value = stage === 'Entry' || stage === 'Growth' || stage === 'Core' || stage === 'Premium' ? stage : ''

  const intensity = asSingleQueryValue(query.intensity) || asSingleQueryValue(query.purchaseIntensity)
  filterPurchaseIntensity.value = ['Dormant', 'Low', 'Medium', 'High', 'VeryHigh'].includes(intensity) ? intensity : ''

  const churn = asSingleQueryValue(query.churn)
  filterChurn.value = churn === 'true' || churn === 'false' || churn === 'excluded' ? churn : ''

  const purchaseCount = asSingleQueryValue(query.purchaseCount) || asSingleQueryValue(query.purchase_count)
  filterPurchaseCount.value = ['1', '2', '3', '5', '10'].includes(purchaseCount) ? purchaseCount : ''

  const week = asSingleQueryValue(query.week)
  filterWeek.value = /^W[1-5]$/.test(week) ? week : ''

  const orderDate = asSingleQueryValue(query.orderDate)
  filterOrderDate.value = /^\d{4}-\d{2}-\d{2}$/.test(orderDate) ? orderDate : ''

  nextTick(() => {
    syncingFromQuery.value = false
  })
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
  'product',
  'productName',
  'sourceChannel',
  'channel',
  'purchaseType',
  'is_fake',
  'petType',
  'pet',
  'stage',
  'intensity',
  'purchaseIntensity',
  'churn',
  'month',
  'purchaseCount',
  'purchase_count',
  'week',
  'orderDate',
])

function syncFiltersToQuery() {
  const current = normalizedQuery(route.query)
  const next: Record<string, string> = {}

  for (const [k, v] of Object.entries(current)) {
    if (!managedKeys.has(k)) next[k] = v
  }

  if (searchQuery.value.trim()) next.q = searchQuery.value.trim()
  if (filterProductName.value.trim()) next.product = filterProductName.value.trim()
  if (filterSourceChannel.value) next.sourceChannel = filterSourceChannel.value
  if (filterPetType.value) next.petType = filterPetType.value
  if (filterStage.value) next.stage = filterStage.value
  if (filterPurchaseIntensity.value) next.intensity = filterPurchaseIntensity.value
  if (filterChurn.value) next.churn = filterChurn.value
  if (selectedMonth.value !== 'all') next.month = selectedMonth.value
  if (filterPurchaseCount.value) next.purchaseCount = filterPurchaseCount.value
  if (selectedMonth.value !== 'all' && filterWeek.value) next.week = filterWeek.value
  if (filterOrderDate.value) next.orderDate = filterOrderDate.value

  const currentCanonical = { ...current }
  delete currentCanonical.search
  delete currentCanonical.productName
  delete currentCanonical.channel
  delete currentCanonical.pet
  delete currentCanonical.purchaseIntensity
  delete currentCanonical.purchaseType
  delete currentCanonical.is_fake
  delete currentCanonical.purchase_count

  if (JSON.stringify(currentCanonical) !== JSON.stringify(next)) {
    router.replace({ query: next })
  }
}

// URL이 바뀌면 화면 필터를 다시 맞춘다.
watch(() => route.query, (query) => {
  applyFiltersFromQuery(query)
}, { immediate: true })

// 월 목록이 늦게 들어오는 경우에도 URL month 값을 다시 적용한다.
watch(
  () => availableMonths.value.length,
  (len, prev) => {
    if (len > 0 && len !== prev) {
      applyFiltersFromQuery(route.query)
    }
  },
)

// 월이 바뀌면 이전 월의 주차/날짜 필터는 비워야 한다.
watch(
  () => selectedMonth.value,
  (month, prevMonth) => {
    if (!prevMonth || month === prevMonth) return
    if (syncingFromQuery.value) return
    if (filterWeek.value) filterWeek.value = ''
    if (month !== 'all' && filterOrderDate.value && filterOrderDate.value.slice(0, 7) !== month) {
      filterOrderDate.value = ''
    }
  },
  { flush: 'sync' },
)

// 필터값이 바뀌면 항상 1페이지로 이동하고 URL도 동기화한다.
watch(
  [searchQuery, filterProductName, filterSourceChannel, filterPetType, filterStage, filterPurchaseIntensity, filterChurn, filterPurchaseCount, filterWeek, filterOrderDate, selectedMonth],
  () => {
    currentPage.value = 1
    syncFiltersToQuery()
  },
)

// 현재 월에 존재하지 않는 주차값이 남아 있으면 자동 정리
watch(
  () => [selectedMonth.value, weekOptions.value.map((option) => option.value).join(',')],
  () => {
    if (selectedMonth.value === 'all') {
      filterWeek.value = ''
      return
    }

    if (filterWeek.value && !weekOptions.value.some((option) => option.value === filterWeek.value)) {
      filterWeek.value = ''
    }
  },
)

// 필터 결과가 줄어들어 현재 페이지가 범위를 벗어나면 마지막 페이지로 보정
watch(
  () => filteredCustomers.value.length,
  () => {
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value
    }
  },
)

// 상품 메타 설정에 따라 이탈 위험 표시를 다시 정리
watch(
  () => hasExpectedConsumptionConfig.value,
  () => {
    applyChurnConfigGuardToCustomers()
  },
  { immediate: true },
)

// 월/프로필 상태가 바뀌면 고객 데이터 재조회
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

// 상세 패널이 열려 있을 때는 주차/날짜 필터 변경 시 주문 이력도 같이 갱신
watch(
  () => [filterWeek.value, filterOrderDate.value],
  async () => {
    if (selectedCustomer.value) {
      await fetchCustomerOrders(selectedCustomer.value)
    }
  },
)

function stagePercent(stage: string): number {
  return customerStagePercent(stage)
}

// 고객 카드/행 클릭 시 우측 상세 패널 열기
async function openCustomerDetail(customer: CustomerRow) {
  selectedCustomer.value = customer
  showCustomerDetail.value = true
  await fetchCustomerOrders(customer)
}

// 현재 필터 조건이 적용된 고객-주문 데이터를 엑셀로 내보낸다.
function downloadFilteredCustomers() {
  const header = ['이름', 'ID', '펫타입', '성장단계', '누적구매월', '구매강도', '최근90일 구매일수', '구매횟수', '구매상품수']
  if (hasProductFilter.value) header.push('검색상품 구매횟수')
  header.push('구매일', '채널', '유형', '상품명', '옵션', '상품 개수', '최근주문', '이탈상태', '이탈기준일수')

  const customerMap = new Map(filteredCustomers.value.map((customer) => [customer.customerKey, customer]))
  const productQuery = filterProductName.value.trim()
  const exportRows = customerPurchaseRows.value
    .filter((row) => {
      const customerKey = row.customer_key || `${row.buyer_id}_${row.buyer_name}`
      if (!customerMap.has(customerKey)) return false
      if (!rowMatchesSourceFilters(row)) return false
      if (filterWeek.value && weekCodeFromDate(row.order_date, selectedMonth.value) !== filterWeek.value) return false
      if (filterOrderDate.value && purchaseDateKey(row) !== filterOrderDate.value) return false
      if (productQuery && !matchesSearchQuery(productQuery, purchaseDisplayProductName(row), row.product_name, row.source_product_name)) return false
      return true
    })
    .sort((a, b) => {
      const customerA = customerMap.get(a.customer_key || `${a.buyer_id}_${a.buyer_name}`)
      const customerB = customerMap.get(b.customer_key || `${b.buyer_id}_${b.buyer_name}`)
      const nameCompare = String(customerA?.name || a.buyer_name || '').localeCompare(
        String(customerB?.name || b.buyer_name || ''),
        'ko',
      )
      if (nameCompare !== 0) return nameCompare

      const idCompare = String(customerA?.id || a.buyer_id || '').localeCompare(
        String(customerB?.id || b.buyer_id || ''),
        'ko',
      )
      if (idCompare !== 0) return idCompare

      const dateCompare = parseOrderDate(b.order_date).getTime() - parseOrderDate(a.order_date).getTime()
      if (dateCompare !== 0) return dateCompare

      return String(a.purchase_id || '').localeCompare(String(b.purchase_id || ''), 'ko')
    })

  const rows = exportRows.map((row) => {
    const customer = customerMap.get(row.customer_key || `${row.buyer_id}_${row.buyer_name}`)
    const quantity = computePurchaseQuantity(purchaseQuantityInput(row)).totalCount
    return [
      customer?.name || row.buyer_name || '-',
      customer?.id || row.buyer_id || '-',
      customer?.petType === 'DOG' ? '강아지' : customer?.petType === 'CAT' ? '고양이' : '모두',
      stageLabel(customer?.stage || 'Other'),
      customer?.purchaseMonthCount || 0,
      intensityLabel(customer?.purchaseIntensity || 'Dormant'),
      customer?.recentPurchaseDayCount || 0,
      customer?.purchaseCount || 0,
      customer?.productCount || 0,
      ...(hasProductFilter.value ? [customer ? matchingProductPurchaseCount(customer) : 0] : []),
      purchaseDateKey(row),
      sourceChannelLabel(normalizePurchaseSourceScope(row).sourceChannel),
      sourceFulfillmentLabel(normalizePurchaseSourceScope(row).sourceChannel, normalizePurchaseSourceScope(row).sourceFulfillmentType),
      purchaseDisplayProductName(row),
      purchaseDisplayOptionInfo(row),
      quantity,
      customer?.lastOrder || purchaseDateKey(row),
      churnLabel(customer?.churnStatus || 'Excluded'),
      customer?.churnExpectedConsumptionDays || '',
    ]
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  XLSX.utils.book_append_sheet(wb, ws, '고객분석')
  XLSX.writeFile(wb, `고객분석_구매이력_${selectedMonth.value === 'all' ? 'all' : selectedMonth.value}.xlsx`)
}

onMounted(async () => {
  // 초기 메타 로드(안전망)
  // 실제 fetchCustomers에서도 다시 읽지만, 첫 진입 시 빈 상태를 줄이기 위해 한 번 더 읽는다.
  await loadProductMeta()
})
</script>
<style scoped>
.customers-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-lg);
  flex-wrap: wrap;
}

.page-header-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.page-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.page-title {
  margin: 0;
  font-size: 1.9rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--color-text);
}

.page-caption {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.customer-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 26px;
  overflow: hidden;
}

.customer-summary-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 22px 24px;
  background: transparent;
}

.customer-summary-card + .customer-summary-card {
  border-left: 1px solid rgba(148, 163, 184, 0.12);
}

.customer-summary-label {
  font-size: 0.83rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.customer-summary-value {
  font-size: 1.45rem;
  font-weight: 700;
  color: var(--color-text);
}

.customer-summary-meta {
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.filter-bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-xl);
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.82);
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

.date-input {
  min-width: 168px;
}

.filter-row-advanced {
  padding-top: 2px;
}

.filter-row :deep(.input-with-icon) {
  min-width: 240px;
  flex: 1 1 240px;
}

.detail-value-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.customer-table-identity,
.customer-table-flow {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.customer-table-identity strong {
  font-size: 0.95rem;
  color: var(--color-text);
}

.customer-table-identity span,
.customer-table-flow span {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.customer-source-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.customer-table-purchase {
  white-space: nowrap;
  font-size: 0.88rem;
  color: var(--color-text);
}

.customer-card-list {
  display: none;
}

@media (max-width: 1024px) {
  .customer-summary-card + .customer-summary-card {
    border-left: none;
    border-top: 1px solid rgba(148, 163, 184, 0.12);
  }

  .filter-bar {
    padding: var(--space-md) var(--space-lg);
  }

  .filter-row {
    gap: var(--space-sm);
  }

  .filter-row .select {
    flex: 1 1 calc(33.333% - var(--space-sm));
  }

  .date-input {
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

  .page-header-actions {
    width: 100%;
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

  .date-input {
    min-width: 0;
    width: 100%;
    flex: 1 1 calc(50% - var(--space-sm));
  }

  .card-header {
    align-items: flex-start;
    gap: var(--space-sm);
  }

  .table-wrapper {
    display: none;
  }

  .customer-card-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .customer-mobile-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .customer-mobile-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .customer-mobile-title {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .customer-mobile-title strong {
    font-size: 1rem;
    color: var(--color-text);
  }

  .customer-mobile-id {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .customer-mobile-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-sm);
  }

  .customer-mobile-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    min-width: 0;
  }

  .customer-mobile-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .customer-mobile-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .customer-mobile-muted {
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .customer-card-empty {
    padding: var(--space-xl);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-lg);
    text-align: center;
    color: var(--color-text-muted);
    background: var(--color-bg);
  }
}
</style>
