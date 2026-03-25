<template>
  <div class="filter-page">
    <div v-if="isViewer" class="status-banner">
      <Info :size="16" :stroke-width="2" />
      <span>열람자 권한에서는 필터링 실행 및 수동 분류를 변경할 수 없습니다.</span>
    </div>
    <div v-if="selectedMonth === 'all'" class="status-banner warning">
      <Info :size="16" :stroke-width="2" />
      <span>월별 분석을 위해 헤더에서 특정 월을 선택해 주세요. 전체 기간에서는 필터링을 실행할 수 없습니다.</span>
    </div>




    <!-- Filter Execution -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">필터링</h3>
        <div class="filter-header-actions">
          <span class="text-sm text-muted">마지막 실행: {{ lastRunLabel }}</span>
          <button v-if="showResults" class="btn btn-secondary btn-sm" @click="downloadFilteredCsv">
            <Download :size="14" :stroke-width="2" />
            정리 엑셀 다운로드
          </button>
        </div>
      </div>
      <div class="filter-stats-row">
        <div class="filter-stat">
          <span class="filter-stat-label">총 주문</span>
          <span class="filter-stat-value">{{ currentFilterStats.total.toLocaleString() }}건</span>
        </div>
        <div class="filter-stat-divider"></div>
        <div class="filter-stat">
          <span class="filter-stat-label">체험단 리스트</span>
          <span class="filter-stat-value">{{ currentFilterStats.influencer.toLocaleString() }}건</span>
        </div>
        <div class="filter-stat-divider"></div>
        <div class="filter-stat">
          <span class="filter-stat-label">매칭 대상</span>
          <span class="filter-stat-value">{{ currentFilterStats.target.toLocaleString() }}건</span>
        </div>
        <button
          v-if="!isViewer"
          class="btn btn-primary btn-lg filter-run-btn"
          :disabled="isRunning || selectedMonth === 'all'"
          :class="{ 'btn-loading': isRunning }"
          @click="showConfirmModal = true"
        >
          <Play :size="18" :stroke-width="2" />
          필터링 시작
        </button>
      </div>

      <!-- Progress (shown during execution) -->
      <div v-if="isRunning" class="filter-progress">
        <div class="flex items-center justify-between mb-sm">
          <span class="text-sm font-medium">{{ progressLabel }}</span>
          <span class="text-sm text-secondary">{{ progressPercent }}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- 분석 결과 요약 -->
    <div class="result-summary-grid" v-if="showResults">
      <div class="result-summary-card">
        <span class="result-summary-label">체험단 감지</span>
        <span class="result-summary-value danger">{{ fakeDetectedCount }}<small>건</small></span>
      </div>
      <div class="result-summary-card">
        <span class="result-summary-label">실구매 비율</span>
        <span class="result-summary-value primary">{{ realPurchaseRate }}<small>%</small></span>
      </div>
      <div class="result-summary-card">
        <span class="result-summary-label">분석 정확도</span>
        <span class="result-summary-value">{{ confidenceScore }}<small>%</small></span>
      </div>
    </div>

    <!-- Results Tabs -->
    <div v-if="showEmptyState" class="card">
      <EmptyState
        title="필터링 실행 이력이 없습니다"
        description="필터링 시작 버튼을 누르면 분석 결과와 검토 대상이 표시됩니다."
      />
    </div>

    <div class="card" v-if="showResults">
      <div class="tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="tab"
          :class="{ active: activeTab === t.key }"
          @click="activeTab = t.key as any"
        >
          {{ t.label }}
          <span class="tab-count">{{ t.count }}</span>
        </button>
      </div>

      <!-- Search Bar -->
      <div class="tab-search">
        <SearchInput
          v-model="searchQuery"
          class="tab-search-input"
          placeholder="주문번호, 구매자명, 상품명으로 검색..."
          width="100%"
        />
      </div>

      <!-- 체험단 매칭 결과 -->
      <div v-if="activeTab === 'rank'">
        <div v-if="filteredRank.length === 0">
          <EmptyState title="결과 없음" :description="searchQuery ? '검색 조건에 맞는 결과가 없습니다.' : '매칭된 체험단 건이 없습니다.'" />
        </div>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>주문번호</th>
                <th>구매자</th>
                <th>상품명</th>
                <th>매칭 단계</th>
                <th>매칭 체험단원</th>
                <th>결과</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(r, idx) in filteredRank"
                :key="r.orderId"
                class="clickable"
                @click="openDetail(r, 'rank')"
              >
                <td class="font-medium" style="font-family: var(--font-mono); font-size: 0.75rem;">{{ r.orderId }}</td>
                <td>{{ r.buyer }}</td>
                <td class="truncate" style="max-width:180px;">{{ r.product }}</td>
                <td>
                  <StatusBadge :label="r.rank > 0 ? `${r.rank}단계` : '수동'" :variant="rankVariant(r.rank)" />
                </td>
                <td>{{ r.matchedName || '—' }}</td>
                <td>
                  <StatusBadge :label="r.result === 'fake' ? '체험단' : '실구매'" :variant="r.result === 'fake' ? 'danger' : 'success'" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 실구매 건 -->
      <div v-if="activeTab === 'realPurchase'">
        <div v-if="filteredReal.length === 0">
          <EmptyState title="결과 없음" :description="searchQuery ? '검색 조건에 맞는 결과가 없습니다.' : '실구매 건이 없습니다.'" />
        </div>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>주문번호</th>
                <th>구매자</th>
                <th>상품명</th>
                <th>옵션</th>
                <th>주문일</th>
                <th>현재 결과</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(rp, idx) in filteredReal"
                :key="rp.orderId"
                class="clickable"
                @click="openDetail(rp, 'realPurchase')"
              >
                <td class="font-medium" style="font-family: var(--font-mono); font-size: 0.75rem;">{{ rp.orderId }}</td>
                <td>{{ rp.buyer }}</td>
                <td class="truncate" style="max-width:200px;">{{ rp.product }}</td>
                <td class="truncate" style="max-width:140px;">{{ rp.optionInfo }}</td>
                <td>{{ rp.orderDate }}</td>
                <td>
                  <StatusBadge :label="rp.result === 'fake' ? '체험단' : '실구매'" :variant="rp.result === 'fake' ? 'danger' : 'success'" />
                </td>
                <td>
                  <button v-if="!isViewer" class="btn btn-secondary btn-sm" @click.stop="openDetail(rp, 'realPurchase')">
                    상세에서 변경
                  </button>
                  <span v-else class="text-sm text-muted">열람 전용</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 미매칭 체험단 -->
      <div v-if="activeTab === 'unmatched'">
        <div v-if="filteredUnmatched.length === 0">
          <EmptyState title="결과 없음" :description="searchQuery ? '검색 조건에 맞는 결과가 없습니다.' : '매칭되지 않은 체험단원이 없습니다.'" />
        </div>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>체험단ID</th>
                <th>체험단원</th>
                <th>미션상품명</th>
                <th>사유</th>
                <th>불일치 포인트</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(u, idx) in filteredUnmatched" :key="u.orderId">
                <td style="font-family: var(--font-mono); font-size: 0.75rem;">{{ u.orderId }}</td>
                <td>{{ u.buyer }}</td>
                <td class="truncate" style="max-width:180px;">{{ u.product }}</td>
                <td><StatusBadge :label="u.reason" variant="warning" /></td>
                <td>
                  <div class="unmatch-tags">
                    <span
                      v-for="tag in u.mismatchTags"
                      :key="`${u.orderId}-${tag}`"
                      class="unmatch-tag"
                    >
                      {{ tag }}
                    </span>
                  </div>
                  <div class="unmatch-summary">{{ u.mismatchSummary }}</div>
                </td>
                <td>
                  <button class="btn btn-secondary btn-sm" @click="openDetail(u, 'unmatched')">
                    상세 확인
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 확인 필요 -->
      <div v-if="activeTab === 'manual'">
        <div class="alert alert-info mb-lg">
          <Info :size="16" :stroke-width="2" />
          <span>아래 건들은 자동 분석 결과의 신뢰도가 낮아 직접 확인이 필요합니다. 행을 클릭하면 상세 비교 화면이 열립니다.</span>
        </div>
        <div v-if="filteredManual.length === 0">
          <EmptyState title="결과 없음" :description="searchQuery ? '검색 조건에 맞는 결과가 없습니다.' : '확인이 필요한 건이 없습니다.'" />
        </div>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>주문번호</th>
                <th>구매자</th>
                <th>상품명</th>
                <th>현재 결과</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(m, idx) in filteredManual"
                :key="m.orderId"
                class="clickable row-warning"
                @click="openDetail(m, 'manual')"
              >
                <td style="font-family: var(--font-mono); font-size: 0.75rem;">{{ m.orderId }}</td>
                <td>{{ m.buyer }}</td>
                <td class="truncate" style="max-width:180px;">{{ m.product }}</td>
                <td><StatusBadge :label="m.result === 'fake' ? '체험단' : '실구매'" :variant="m.result === 'fake' ? 'danger' : 'success'" /></td>
                <td>
                  <div v-if="!isViewer" class="flex gap-sm">
                    <button class="btn btn-secondary btn-sm" @click.stop="openDetail(m, 'manual')">
                      상세에서 변경
                    </button>
                    <button class="btn btn-ghost btn-sm" @click.stop="markReviewed(m)">
                      <Check :size="14" :stroke-width="2" />
                      확인 완료
                    </button>
                  </div>
                  <span v-else class="text-sm text-muted">열람 전용</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Detail Slide Panel -->
    <SlidePanel v-model="showDetail" title="주문 상세 비교">
      <template v-if="selectedItem">
        <template v-if="selectedSource === 'unmatched'">
          <div class="detail-section">
            <div class="detail-section-title">미매칭 체험단 정보</div>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">체험단ID</span>
                <span class="detail-value" style="font-family: var(--font-mono);">{{ selectedItem.orderId }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">수취인명</span>
                <span class="detail-value">{{ selectedItem.buyer || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">미션상품</span>
                <span class="detail-value">{{ selectedItem.product || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">옵션</span>
                <span class="detail-value">{{ selectedItem.optionInfo || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">인증일</span>
                <span class="detail-value">{{ selectedItem.experienceDate || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">네이버ID</span>
                <span class="detail-value">{{ selectedItem.naverId || '-' }}</span>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">미매칭 분석</div>
            <div class="unmatch-tags detail-tags">
              <span
                v-for="tag in selectedItem.mismatchTags || []"
                :key="`detail-${selectedItem.orderId}-${tag}`"
                class="unmatch-tag"
              >
                {{ tag }}
              </span>
            </div>
            <p class="unmatch-summary detail-summary">{{ selectedItem.mismatchSummary }}</p>
          </div>

          <div class="detail-section" v-if="selectedItem.topCandidate">
            <div class="detail-section-title">근접 주문 후보</div>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">주문번호</span>
                <span class="detail-value" style="font-family: var(--font-mono);">{{ selectedItem.topCandidate.purchaseId }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">구매자 / 수취인</span>
                <span class="detail-value">{{ selectedItem.topCandidate.buyerName }} / {{ selectedItem.topCandidate.receiverName || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">주문일</span>
                <span class="detail-value">{{ selectedItem.topCandidate.orderDate }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">옵션</span>
                <span class="detail-value">{{ selectedItem.topCandidate.optionInfo }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">ID 일치</span>
                <StatusBadge :label="selectedItem.topCandidate.idMatch ? '일치' : '불일치'" :variant="selectedItem.topCandidate.idMatch ? 'success' : 'warning'" />
              </div>
              <div class="detail-item">
                <span class="detail-label">이름 일치</span>
                <StatusBadge :label="selectedItem.topCandidate.nameMatch ? '일치' : '불일치'" :variant="selectedItem.topCandidate.nameMatch ? 'success' : 'warning'" />
              </div>
              <div class="detail-item">
                <span class="detail-label">옵션 일치</span>
                <StatusBadge :label="selectedItem.topCandidate.optionMatch ? '일치' : '불일치'" :variant="selectedItem.topCandidate.optionMatch ? 'success' : 'warning'" />
              </div>
              <div class="detail-item">
                <span class="detail-label">날짜 차이</span>
                <span class="detail-value">{{ selectedItem.topCandidate.dateGap }}일</span>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <!-- Order Info -->
          <div class="detail-section">
            <div class="detail-section-title">주문 정보</div>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">주문번호</span>
                <span class="detail-value" style="font-family: var(--font-mono);">{{ selectedItem.orderId }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">구매자</span>
                <span class="detail-value">{{ selectedItem.buyer }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">상품</span>
                <span class="detail-value">{{ selectedItem.product }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">주문일</span>
                <span class="detail-value">{{ selectedItem.orderDate || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">ID</span>
                <span class="detail-value">{{ selectedItem.buyerId || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">현재 결과</span>
                <StatusBadge
                  v-if="selectedItem.result === 'fake' || selectedItem.result === 'real'"
                  :label="selectedItem.result === 'fake' ? '체험단' : '실구매'"
                  :variant="selectedItem.result === 'fake' ? 'danger' : 'success'"
                />
                <span v-else class="detail-value">-</span>
              </div>
            </div>
          </div>

          <!-- Matched Experience Info -->
          <div v-if="selectedItem.matchedName" class="detail-section">
            <div class="detail-section-title">매칭된 체험단원</div>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">수취인명</span>
                <span class="detail-value">{{ selectedItem.matchedName }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">인증일</span>
                <span class="detail-value">{{ selectedItem.matchedDate || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">미션상품</span>
                <span class="detail-value">{{ selectedItem.matchedProduct || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">매칭 단계</span>
                <StatusBadge :label="selectedItem.rank > 0 ? `${selectedItem.rank}단계 - ${selectedItem.matchReason || '자동매칭'}` : '수동 지정'" :variant="rankVariant(selectedItem.rank || 0)" />
              </div>
            </div>
          </div>
        </template>

        <!-- Action Buttons in Panel -->
        <div class="detail-section" style="margin-top: var(--space-xl);">
          <div v-if="!isViewer" class="flex gap-sm">
            <button v-if="isResultEditable && selectedItem.result === 'fake'" class="btn btn-primary" @click="selectedItem.result = 'real'">
              <RefreshCcw :size="14" :stroke-width="2" />
              실구매로 변경
            </button>
            <button v-else-if="isResultEditable" class="btn btn-danger" @click="selectedItem.result = 'fake'">
              <UserX :size="14" :stroke-width="2" />
              체험단으로 변경
            </button>
            <button v-if="isResultEditable" class="btn btn-primary" :disabled="!hasPendingResultChange" @click="saveDetailResult">
              저장
            </button>
            <button class="btn btn-secondary" @click="closeDetail">
              닫기
            </button>
          </div>
          <div v-else class="flex gap-sm">
            <button class="btn btn-secondary" @click="closeDetail">닫기</button>
          </div>
        </div>
      </template>
    </SlidePanel>

    <!-- Confirm Modal -->
    <ConfirmModal
      v-if="!isViewer"
      v-model="showConfirmModal"
      title="필터링을 시작하시겠어요?"
      variant="warning"
      confirm-label="실행"
      @confirm="runFilter"
    >
      <p class="mb-md">주문 <strong>{{ currentFilterStats.target.toLocaleString() }}건</strong>에 대해 체험단 자동 매칭을 수행합니다.</p>
      <p class="text-sm text-secondary">• 이전에 직접 변경한 건은 보호됩니다.<br>• 실행 전 데이터가 자동 저장됩니다.</p>
    </ConfirmModal>
  </div>
</template>

<script setup lang="ts">
import {
  Play,
  Info,
  Check,
  RefreshCcw,
  UserX,
  Download,
} from 'lucide-vue-next'
import * as XLSX from 'xlsx'
import {
  buildMatchingResult as buildMatchingResultUtil,
  computeUnmatchReason as computeUnmatchReasonUtil,
  extractProductKeyword,
  extractPurchaseOptionKeyword,
  extractExperienceOptionKeyword,
  deduplicateExperiences,
} from '~/composables/useFilterMatching'
import { matchesSearchQuery } from '~/composables/useTextSearch'
import { FILTER_VER } from '../../shared/filterVersion'

type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
type SourceType = 'rank' | 'realPurchase' | 'manual' | 'unmatched'

interface PurchaseRow {
  purchase_id: string
  target_month: string
  buyer_id: string
  buyer_name: string
  receiver_name: string | null
  product_id: string
  product_name: string
  option_info: string | null
  quantity: number
  order_date: string
  is_fake: boolean
  match_reason: string | null
  match_rank: number | null
  matched_exp_id: number | null
  needs_review: boolean
  is_manual: boolean
  filter_ver: string | null
  quantity_warning: boolean
}

interface ExperienceRow {
  id: number
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

interface ResultRow {
  purchaseId: string
  orderId: string
  buyer: string
  buyerId: string
  product: string
  optionInfo: string
  orderDate: string
  rank: number
  matchReason: string
  matchedName: string
  matchedId: string
  matchedDate: string
  matchedProduct: string
  matchedExpId: number | null
  result: 'fake' | 'real'
  needsReview: boolean
}

interface UnmatchedRow {
  orderId: string
  buyer: string
  product: string
  optionInfo: string
  reason: string
  experienceId: number
  experienceDate: string
  naverId: string
  mappedProductId: string
  mismatchSummary: string
  mismatchTags: string[]
  candidateCount: number
  topCandidate: UnmatchedCandidate | null
}

interface UnmatchedCandidate {
  purchaseId: string
  buyerName: string
  receiverName: string
  orderDate: string
  optionInfo: string
  idMatch: boolean
  nameMatch: boolean
  optionMatch: boolean
  dateGap: number
}

interface UnmatchedInsight {
  mismatchSummary: string
  mismatchTags: string[]
  candidateCount: number
  topCandidate: UnmatchedCandidate | null
}

interface FilterStats {
  total: number
  influencer: number
  target: number
}

interface PurchaseFilterSnapshot {
  purchase_id: string
  is_fake: boolean
  match_reason: string | null
  match_rank: number | null
  matched_exp_id: number | null
  needs_review: boolean
  filter_ver: string | null
  quantity_warning: boolean
}

const UPDATE_CONCURRENCY = 10
const FETCH_PAGE_SIZE = 1000

const supabase = useSupabaseClient()
const toast = useToast()
const { user, isViewer, profileLoaded, profileRevision } = useCurrentUser()
const { createNotification } = useNotifications()
const { selectedMonth } = useAnalysisPeriod()
const { setFilterResult, setPendingReview } = useMonthlyWorkflow()

const activeTab = ref<'rank' | 'realPurchase' | 'unmatched' | 'manual'>('rank')
const filterState = ref<'idle' | 'running' | 'completed' | 'manual_review' | 'failed'>('idle')
const progressPercent = ref(0)
const progressLabel = ref('')
const showDetail = ref(false)
const selectedItem = ref<any>(null)
const selectedSource = ref<SourceType | null>(null)
const originalResult = ref<'real' | 'fake' | null>(null)
const showConfirmModal = ref(false)
const revealResultSection = ref(false)
const loading = ref(false)
const lastRunLabel = ref('미실행')
const currentFilterStats = ref<FilterStats>({ total: 0, influencer: 0, target: 0 })
const allPurchases = ref<PurchaseRow[]>([])
const allExperiences = ref<ExperienceRow[]>([])
const rankResults = ref<ResultRow[]>([])
const realPurchaseResults = ref<ResultRow[]>([])
const unmatchedResults = ref<UnmatchedRow[]>([])
const manualResults = ref<ResultRow[]>([])
const searchQuery = ref('')
const fetchSeq = ref(0)

async function runConcurrentUpdates<T>(items: T[], worker: (item: T) => Promise<void>, chunkSize = UPDATE_CONCURRENCY) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const batch = items.slice(i, i + chunkSize)
    await Promise.all(batch.map((item) => worker(item)))
  }
}

const isRunning = computed(() => filterState.value === 'running')
const manualRows = computed(() => manualResults.value)
const hasAnyResult = computed(() => {
  if (rankResults.value.length > 0 || realPurchaseResults.value.length > 0 || unmatchedResults.value.length > 0 || manualRows.value.length > 0) return true
  return lastRunLabel.value !== '미실행'
})
// 기존 실행 이력이 있으면(재접속/재시작 포함) 결과를 바로 보여주고,
// 이력이 없는 월은 사용자가 "필터링 시작"을 눌렀을 때만 결과 영역을 연다.
const showResults = computed(() => hasAnyResult.value)
const showEmptyState = computed(() => revealResultSection.value && !loading.value && !hasAnyResult.value)
const fakeDetectedCount = computed(() => rankResults.value.filter((item) => item.result === 'fake').length)
const realPurchaseRate = computed(() => {
  const total = currentFilterStats.value.total
  if (total <= 0) return 0
  return Number((((total - fakeDetectedCount.value) / total) * 100).toFixed(1))
})
const confidenceScore = computed(() => {
  const totalFake = fakeDetectedCount.value
  if (totalFake <= 0) return 100
  const stableMatches = rankResults.value.filter((row) => row.rank > 0 && row.rank <= 3).length
  return Number(((stableMatches / totalFake) * 100).toFixed(1))
})

// 검색 필터링
function matchesSearch(query: string, ...fields: string[]): boolean {
  return matchesSearchQuery(query, ...fields)
}

const filteredRank = computed(() => rankResults.value.filter((r) => matchesSearch(searchQuery.value, r.orderId, r.buyer, r.product, r.matchedName)))
const filteredReal = computed(() => realPurchaseResults.value.filter((r) => matchesSearch(searchQuery.value, r.orderId, r.buyer, r.product, r.optionInfo)))
const filteredUnmatched = computed(() => unmatchedResults.value.filter((u) => matchesSearch(
  searchQuery.value,
  u.orderId,
  u.buyer,
  u.product,
  u.reason,
  u.mismatchSummary,
  u.mismatchTags.join(' '),
  u.topCandidate?.purchaseId || '',
  u.topCandidate?.buyerName || '',
)))
const filteredManual = computed(() => manualRows.value.filter((m) => matchesSearch(searchQuery.value, m.orderId, m.buyer, m.product)))

const tabs = computed(() => [
  { key: 'rank', label: '체험단 매칭', count: rankResults.value.length },
  { key: 'realPurchase', label: '실구매 건', count: realPurchaseResults.value.length },
  { key: 'unmatched', label: '미매칭 체험단', count: unmatchedResults.value.length },
  { key: 'manual', label: '확인 필요', count: manualRows.value.length },
])

const isResultEditable = computed(() => {
  if (!selectedSource.value || !selectedItem.value) return false
  if (selectedSource.value === 'unmatched') return false
  return Boolean(selectedItem.value.purchaseId)
})

const hasPendingResultChange = computed(() => {
  if (!isResultEditable.value || !selectedItem.value || !originalResult.value) return false
  return selectedItem.value.result !== originalResult.value
})

function rankVariant(rank: number): BadgeVariant {
  if (rank <= 0) return 'neutral'
  if (rank <= 2) return 'primary'
  if (rank <= 3) return 'info'
  return 'warning'
}

function normalizeText(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[^0-9a-z가-힣]/g, '')
}

function formatDate(value: string): string {
  if (!value) return '-'
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('ko-KR')
}

function formatDateTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value || '-'
  return d.toLocaleString('ko-KR', { hour12: false })
}

function maskId(value: string): string {
  const v = String(value || '').trim()
  if (!v) return '-'
  if (v.length <= 4) return `${v}****`
  return `${v.slice(0, 4)}****`
}

function normalizeNameText(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[^0-9a-z가-힣*]/g, '')
}

function idPrefix(value: unknown): string {
  return normalizeText(value).slice(0, 4)
}

function toDate(value: string): Date | null {
  if (!value) return null
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function diffDays(a: string, b: string): number {
  const da = toDate(a)
  const db = toDate(b)
  if (!da || !db) return Number.POSITIVE_INFINITY
  const ms = Math.abs(da.getTime() - db.getTime())
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function idsMatch(purchase: PurchaseRow, exp: ExperienceRow): boolean {
  const left = idPrefix(purchase.buyer_id)
  const right = idPrefix(exp.naver_id)
  return Boolean(left) && Boolean(right) && left === right
}

function namesMatch(purchase: PurchaseRow, exp: ExperienceRow): boolean {
  const target = normalizeNameText(exp.receiver_name)
  if (!target) return false
  const buyer = normalizeNameText(purchase.buyer_name)
  const receiver = normalizeNameText(purchase.receiver_name || '')
  return namesEquivalent(target, buyer) || namesEquivalent(target, receiver)
}

function namesEquivalent(left: string, right: string): boolean {
  if (!left || !right) return false
  if (left === right) return true
  if (!left.includes('*') && !right.includes('*')) return false
  if (left.length !== right.length) return false

  for (let i = 0; i < left.length; i += 1) {
    const leftChar = left[i]
    const rightChar = right[i]
    if (leftChar === '*' || rightChar === '*') continue
    if (leftChar !== rightChar) return false
  }
  return true
}

function productMatches(purchase: PurchaseRow, exp: ExperienceRow): boolean {
  const purchaseKw = extractProductKeyword(purchase.product_name)
  const expKw = extractProductKeyword(exp.mission_product_name)

  if (purchaseKw && expKw) return purchaseKw === expKw

  const pName = normalizeText(purchase.product_name)
  const eName = normalizeText(exp.mission_product_name)
  if (!pName || !eName) return false
  return pName === eName || pName.includes(eName) || eName.includes(pName)
}

function optionsMatch(purchase: PurchaseRow, exp: ExperienceRow): boolean {
  const productKw = extractProductKeyword(purchase.product_name)
  if (productKw === '츄르짜개') return true
  if (productKw === '츄라잇') {
    const pRaw = normalizeText(purchase.option_info || '')
    const eRaw = normalizeText(exp.option_info || '')
    if (!pRaw && !eRaw) return true
    if (!pRaw || !eRaw) return false
    return pRaw === eRaw
  }

  if (!productKw) {
    const pOpt = normalizeText(purchase.option_info || '')
    const eOpt = normalizeText(exp.option_info || '')
    if (!pOpt && !eOpt) return true
    if (!pOpt || !eOpt) return true
    return pOpt === eOpt || pOpt.includes(eOpt) || eOpt.includes(pOpt)
  }

  const purchaseOptionKw = extractPurchaseOptionKeyword(productKw, purchase.product_name, purchase.option_info || '')
  const expOptionKw = extractExperienceOptionKeyword(productKw, exp.option_info || '')

  if (!purchaseOptionKw && !expOptionKw) return true
  if (!purchaseOptionKw || !expOptionKw) return false
  return purchaseOptionKw === expOptionKw
}

function buildUnmatchedInsight(exp: ExperienceRow, purchases: PurchaseRow[]): UnmatchedInsight {
  const reason = exp.unmatch_reason || computeUnmatchReasonUtil(exp as any, purchases as any)

  if (reason === '상품매핑_실패') {
    return {
      mismatchSummary: '상품 목록과 연결된 기준 상품이 없어 매칭을 진행할 수 없습니다.',
      mismatchTags: ['상품 매핑 필요'],
      candidateCount: 0,
      topCandidate: null,
    }
  }

  const productCandidates = purchases.filter((purchase) => productMatches(purchase, exp))
  const dateCandidates = productCandidates.filter((purchase) => diffDays(purchase.order_date, exp.purchase_date) <= 1)

  if (reason === '기간외_주문없음') {
    return {
      mismatchSummary: `같은 상품 주문 ${productCandidates.length}건은 있으나 인증일 기준 ±1일 후보가 없습니다.`,
      mismatchTags: ['기간 불일치'],
      candidateCount: 0,
      topCandidate: null,
    }
  }

  const analyzed = dateCandidates
    .map((purchase) => {
      const idMatch = idsMatch(purchase, exp)
      const nameMatch = namesMatch(purchase, exp)
      const optionMatch = optionsMatch(purchase, exp)
      const dateGap = diffDays(purchase.order_date, exp.purchase_date)
      const score = (idMatch ? 3 : 0) + (nameMatch ? 2 : 0) + (optionMatch ? 1 : 0) - dateGap
      return {
        purchase,
        idMatch,
        nameMatch,
        optionMatch,
        dateGap,
        score,
      }
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (a.dateGap !== b.dateGap) return a.dateGap - b.dateGap
      return String(a.purchase.purchase_id).localeCompare(String(b.purchase.purchase_id))
    })

  const idMatchCount = analyzed.filter((item) => item.idMatch).length
  const nameMatchCount = analyzed.filter((item) => item.nameMatch).length
  const optionMatchCount = analyzed.filter((item) => item.optionMatch).length

  const mismatchTags: string[] = []
  if (idMatchCount === 0) mismatchTags.push('ID 불일치')
  if (nameMatchCount === 0) mismatchTags.push('이름 불일치')
  if (optionMatchCount === 0) mismatchTags.push('옵션 불일치')
  if (mismatchTags.length === 0) mismatchTags.push('복합 조건 불일치')

  const top = analyzed[0]
  const topCandidate: UnmatchedCandidate | null = top
    ? {
      purchaseId: top.purchase.purchase_id,
      buyerName: top.purchase.buyer_name || '-',
      receiverName: top.purchase.receiver_name || '-',
      orderDate: formatDate(top.purchase.order_date),
      optionInfo: top.purchase.option_info || '-',
      idMatch: top.idMatch,
      nameMatch: top.nameMatch,
      optionMatch: top.optionMatch,
      dateGap: top.dateGap,
    }
    : null

  return {
    mismatchSummary: `후보 ${dateCandidates.length}건 중 ID일치 ${idMatchCount}건, 이름일치 ${nameMatchCount}건, 옵션일치 ${optionMatchCount}건`,
    mismatchTags,
    candidateCount: dateCandidates.length,
    topCandidate,
  }
}

function toResultRow(purchase: PurchaseRow, expMap: Map<number, ExperienceRow>): ResultRow {
  const exp = purchase.matched_exp_id ? expMap.get(Number(purchase.matched_exp_id)) : null
  return {
    purchaseId: purchase.purchase_id,
    orderId: purchase.purchase_id,
    buyer: purchase.buyer_name,
    buyerId: maskId(purchase.buyer_id),
    product: purchase.product_name,
    optionInfo: purchase.option_info || '-',
    orderDate: formatDate(purchase.order_date),
    rank: Number(purchase.match_rank || 0),
    matchReason: purchase.match_reason || '',
    matchedName: exp?.receiver_name || '',
    matchedId: maskId(exp?.naver_id || ''),
    matchedDate: exp?.purchase_date ? formatDate(exp.purchase_date) : '-',
    matchedProduct: exp?.mission_product_name || '-',
    matchedExpId: purchase.matched_exp_id ? Number(purchase.matched_exp_id) : null,
    result: purchase.is_fake ? 'fake' : 'real',
    needsReview: Boolean(purchase.needs_review),
  }
}

function syncFilterState() {
  if (isRunning.value) return
  if (manualRows.value.length > 0) {
    filterState.value = 'manual_review'
    return
  }
  if (hasAnyResult.value) {
    filterState.value = 'completed'
    return
  }
  filterState.value = 'idle'
}

async function restoreFilterSnapshots(
  purchaseSnapshots: PurchaseFilterSnapshot[],
  experienceReasonSnapshots: Map<number, string | null>,
) {
  await runConcurrentUpdates(purchaseSnapshots, async (snapshot) => {
    const { error } = await supabase
      .from('purchases')
      .update({
        is_fake: snapshot.is_fake,
        match_reason: snapshot.match_reason,
        match_rank: snapshot.match_rank,
        matched_exp_id: snapshot.matched_exp_id,
        needs_review: snapshot.needs_review,
        filter_ver: snapshot.filter_ver,
        quantity_warning: snapshot.quantity_warning,
      })
      .eq('purchase_id', snapshot.purchase_id)
    if (error) throw error
  })

  const reasonEntries = Array.from(experienceReasonSnapshots.entries())
  await runConcurrentUpdates(reasonEntries, async ([expId, reason]) => {
    const { error } = await supabase
      .from('experiences')
      .update({ unmatch_reason: reason })
      .eq('id', expId)
    if (error) throw error
  })
}

async function loadRawData(month: string): Promise<{ purchases: PurchaseRow[]; experiences: ExperienceRow[] }> {
  const purchaseData: any[] = []
  const expData: any[] = []

  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    let purchaseQuery = supabase
      .from('purchases')
      .select('purchase_id, target_month, buyer_id, buyer_name, receiver_name, product_id, product_name, option_info, quantity, order_date, is_fake, match_reason, match_rank, matched_exp_id, needs_review, is_manual, filter_ver, quantity_warning')
      .order('order_date', { ascending: true })
      .order('purchase_id', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1)
    if (month !== 'all') purchaseQuery = purchaseQuery.eq('target_month', month)

    const { data, error } = await purchaseQuery
    if (error) throw error
    const rows = data || []
    purchaseData.push(...rows)
    if (rows.length < FETCH_PAGE_SIZE) break
  }

  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    let experienceQuery = supabase
      .from('experiences')
      .select('id, target_month, campaign_id, mission_product_name, mapped_product_id, option_info, receiver_name, naver_id, purchase_date, unmatch_reason')
      .order('purchase_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1)
    if (month !== 'all') experienceQuery = experienceQuery.eq('target_month', month)

    const { data, error } = await experienceQuery
    if (error) throw error
    const rows = data || []
    expData.push(...rows)
    if (rows.length < FETCH_PAGE_SIZE) break
  }

  return {
    purchases: (purchaseData as any[]).map((row) => ({
      purchase_id: String(row.purchase_id || ''),
      target_month: String(row.target_month || ''),
      buyer_id: String(row.buyer_id || ''),
      buyer_name: String(row.buyer_name || ''),
      receiver_name: row.receiver_name || '',
      product_id: String(row.product_id || ''),
      product_name: String(row.product_name || ''),
      option_info: row.option_info || '',
      quantity: Number(row.quantity || 0),
      order_date: String(row.order_date || ''),
      is_fake: Boolean(row.is_fake),
      match_reason: row.match_reason || null,
      match_rank: row.match_rank ? Number(row.match_rank) : null,
      matched_exp_id: row.matched_exp_id ? Number(row.matched_exp_id) : null,
      needs_review: Boolean(row.needs_review),
      is_manual: Boolean(row.is_manual),
      filter_ver: row.filter_ver || null,
      quantity_warning: Boolean(row.quantity_warning),
    })),
    experiences: (expData as any[]).map((row) => ({
      id: Number(row.id),
      target_month: String(row.target_month || ''),
      campaign_id: Number(row.campaign_id || 0),
      mission_product_name: String(row.mission_product_name || ''),
      mapped_product_id: row.mapped_product_id || null,
      option_info: row.option_info || '',
      receiver_name: String(row.receiver_name || ''),
      naver_id: String(row.naver_id || ''),
      purchase_date: String(row.purchase_date || ''),
      unmatch_reason: row.unmatch_reason || null,
    })),
  }
}

async function fetchFilterData() {
  const seq = ++fetchSeq.value
  loading.value = true
  try {
    const month = selectedMonth.value
    const { purchases, experiences } = await loadRawData(month)
    if (seq !== fetchSeq.value) return
    allPurchases.value = purchases
    // 체험단 중복 제거 적용
    const dedupedExperiences = deduplicateExperiences(experiences as any) as typeof experiences
    allExperiences.value = dedupedExperiences

    currentFilterStats.value = {
      total: purchases.length,
      influencer: dedupedExperiences.length,
      target: purchases.filter((row) => !row.is_manual).length,
    }

    const matchedExpIds = new Set(purchases.map((row) => Number(row.matched_exp_id)).filter((id) => Number.isFinite(id) && id > 0))
    const expMap = new Map<number, ExperienceRow>()
    for (const exp of dedupedExperiences) expMap.set(exp.id, exp)

    // 체험단 = is_fake 전체
    rankResults.value = purchases
      .filter((row) => row.is_fake)
      .sort((a, b) => {
        const rankA = Number(a.match_rank || 99)
        const rankB = Number(b.match_rank || 99)
        if (rankA !== rankB) return rankA - rankB
        return String(a.purchase_id).localeCompare(String(b.purchase_id))
      })
      .map((row) => toResultRow(row, expMap))

    // 실구매 = is_fake = false 전체 (수동 확정 포함)
    realPurchaseResults.value = purchases
      .filter((row) => !row.is_fake)
      .sort((a, b) => String(b.order_date).localeCompare(String(a.order_date)))
      .map((row) => toResultRow(row, expMap))

    // 확인 필요 = needs_review = true (검토 큐, 분류 탭과 중복 가능)
    manualResults.value = purchases
      .filter((row) => row.needs_review)
      .sort((a, b) => String(b.order_date).localeCompare(String(a.order_date)))
      .map((row) => toResultRow(row, expMap))

    unmatchedResults.value = dedupedExperiences
      .filter((exp) => !matchedExpIds.has(exp.id))
      .map((exp) => {
        const insight = buildUnmatchedInsight(exp, purchases)
        return {
          orderId: `EXP-${exp.id}`,
          buyer: exp.receiver_name || '-',
          product: exp.mission_product_name || '-',
          optionInfo: exp.option_info || '-',
          reason: exp.unmatch_reason || computeUnmatchReasonUtil(exp, purchases),
          experienceId: exp.id,
          experienceDate: formatDate(exp.purchase_date),
          naverId: maskId(exp.naver_id),
          mappedProductId: exp.mapped_product_id || '',
          mismatchSummary: insight.mismatchSummary,
          mismatchTags: insight.mismatchTags,
          candidateCount: insight.candidateCount,
          topCandidate: insight.topCandidate,
        }
      })

    let logQuery = supabase
      .from('filter_logs')
      .select('executed_at')
      .order('executed_at', { ascending: false })
      .limit(1)
    if (month !== 'all') logQuery = logQuery.eq('target_month', month)
    const { data: logData } = await logQuery
    if (seq !== fetchSeq.value) return
    lastRunLabel.value = logData?.[0]?.executed_at ? formatDateTime(logData[0].executed_at) : '미실행'

    syncFilterState()
  } catch (error: any) {
    if (seq !== fetchSeq.value) return
    console.error('Failed to fetch filter data:', error)
    toast.error('필터링 데이터를 불러오지 못했습니다.')
  } finally {
    if (seq === fetchSeq.value) loading.value = false
  }
}

async function persistFilterLog(payload: {
  status: 'success' | 'error'
  durationSec?: number
  rankCounts?: Record<number, number>
  totalMatched?: number
  totalUnmatchedExp?: number
  totalPurchasesProcessed?: number
  totalExpProcessed?: number
  newMatches?: number
  removedMatches?: number
  protectedCount?: number
  ambiguousCount?: number
  errorMessage?: string
}) {
  const actorName = user.value.name || user.value.email || 'unknown'
  const actorId = user.value.id || null
  const totalMatched = Number(payload.totalMatched || 0)
  const rankBreakdown = payload.rankCounts
    ? [1, 2, 3, 4, 5].map((rank) => {
      const count = Number(payload.rankCounts?.[rank] || 0)
      return {
        rank,
        count,
        percent: totalMatched > 0 ? Math.round((count / totalMatched) * 100) : 0,
      }
    })
    : []

  await supabase.from('filter_logs').insert({
    executed_by_account_id: actorId,
    executed_by: actorName,
    filter_ver: FILTER_VER,
    target_month: selectedMonth.value === 'all' ? null : selectedMonth.value,
    status: payload.status,
    summary_json: {
      duration_sec: Number(payload.durationSec || 0),
      rank_breakdown: rankBreakdown,
      new_matches: Number(payload.newMatches || 0),
      removed_matches: Number(payload.removedMatches || 0),
      protected_count: Number(payload.protectedCount || 0),
      ambiguous_count: Number(payload.ambiguousCount || 0),
    },
    error_message: payload.errorMessage || null,
    total_purchases_processed: Number(payload.totalPurchasesProcessed || 0),
    total_exp_processed: Number(payload.totalExpProcessed || 0),
    total_matched: totalMatched,
    total_unmatched_exp: Number(payload.totalUnmatchedExp || 0),
  })
}

async function runFilter() {
  if (isViewer.value || isRunning.value || selectedMonth.value === 'all') return
  showConfirmModal.value = false
  revealResultSection.value = true

  const month = selectedMonth.value
  let monthFilterLockToken: string | null = null
  const startedAt = Date.now()
  let loadedPurchases: PurchaseRow[] = []
  let loadedExperiences: ExperienceRow[] = []
  let purchaseSnapshots: PurchaseFilterSnapshot[] = []
  let experienceReasonSnapshots = new Map<number, string | null>()
  let hasPurchaseMutation = false
  let hasExperienceMutation = false
  filterState.value = 'running'
  progressPercent.value = 5
  progressLabel.value = '분석 대상 데이터를 불러오는 중...'

  try {
    try {
      const lockResponse = await $fetch<{ token: string }>('/api/filter/lock', {
        method: 'POST',
        body: {
          action: 'acquire',
          month,
          owner: user.value.name || user.value.email || '수동 필터링',
        },
      })
      monthFilterLockToken = String(lockResponse.token || '')
    } catch (lockError: any) {
      filterState.value = 'idle'
      progressPercent.value = 0
      progressLabel.value = ''
      toast.info(lockError?.data?.message || `${month} 필터링이 이미 실행 중입니다.`)
      return
    }

    const { purchases, experiences } = await loadRawData(month)
    loadedPurchases = purchases
    loadedExperiences = experiences
    if (purchases.length === 0) {
      toast.info('분석할 주문 데이터가 없습니다.')
      filterState.value = 'idle'
      progressPercent.value = 0
      progressLabel.value = ''
      return
    }

    purchaseSnapshots = purchases
      .filter((row) => !row.is_manual)
      .map((row) => ({
        purchase_id: row.purchase_id,
        is_fake: row.is_fake,
        match_reason: row.match_reason,
        match_rank: row.match_rank,
        matched_exp_id: row.matched_exp_id,
        needs_review: row.needs_review,
        filter_ver: row.filter_ver,
        quantity_warning: row.quantity_warning,
      }))
    experienceReasonSnapshots = new Map(
      experiences.map((exp) => [exp.id, exp.unmatch_reason || null] as const),
    )

    progressPercent.value = 18
    progressLabel.value = '기존 자동 판정 결과를 초기화하는 중...'

    const { error: resetError } = await supabase
      .from('purchases')
      .update({
        is_fake: false,
        match_reason: null,
        match_rank: null,
        matched_exp_id: null,
        needs_review: false,
        filter_ver: null,
        quantity_warning: false,
      })
      .eq('target_month', month)
      .eq('is_manual', false)
    if (resetError) throw resetError
    hasPurchaseMutation = true

    progressPercent.value = 34
    progressLabel.value = '1~5단계 순차 매칭을 수행하는 중...'

    const matching = buildMatchingResultUtil(purchases, experiences)

    progressPercent.value = 58
    progressLabel.value = '매칭 결과를 저장하는 중...'

    await runConcurrentUpdates(matching.matches, async (match) => {
      const { error } = await supabase
        .from('purchases')
        .update({
          is_fake: true,
          match_reason: match.reason,
          match_rank: match.rank,
          matched_exp_id: match.expId,
          needs_review: match.needsReview,
          filter_ver: FILTER_VER,
          quantity_warning: match.quantityWarning,
        })
        .eq('purchase_id', match.purchaseId)
      if (error) throw error
    })

    if (matching.reviewPurchaseIds.length > 0) {
      for (let i = 0; i < matching.reviewPurchaseIds.length; i += 50) {
        const batch = matching.reviewPurchaseIds.slice(i, i + 50)
        const { error } = await supabase
          .from('purchases')
          .update({
            is_fake: false,
            match_reason: '다중후보_확인필요',
            match_rank: null,
            matched_exp_id: null,
            needs_review: true,
            filter_ver: FILTER_VER,
            quantity_warning: false,
          })
          .in('purchase_id', batch)
        if (error) throw error
      }
    }

    progressPercent.value = 76
    progressLabel.value = '미매칭 사유를 갱신하는 중...'

    const { error: clearReasonError } = await supabase
      .from('experiences')
      .update({ unmatch_reason: null })
      .eq('target_month', month)
    if (clearReasonError) throw clearReasonError
    hasExperienceMutation = true

    const unmatchedEntries = Array.from(matching.unmatchedReasons.entries())
    await runConcurrentUpdates(unmatchedEntries, async ([expId, reason]) => {
      const { error } = await supabase
        .from('experiences')
        .update({ unmatch_reason: reason })
        .eq('id', expId)
      if (error) throw error
    })

    // 필터링 실행월의 자동 대상 주문에 필터 버전을 일괄 각인한다.
    // (매칭되지 않아 업데이트 대상에서 빠진 실구매 건도 고객분석에 반영되도록 보장)
    const { error: stampFilterVersionError } = await supabase
      .from('purchases')
      .update({ filter_ver: FILTER_VER })
      .eq('target_month', month)
      .eq('is_manual', false)
      .is('filter_ver', null)
    if (stampFilterVersionError) throw stampFilterVersionError

    const durationSec = (Date.now() - startedAt) / 1000
    progressPercent.value = 90
    progressLabel.value = '실행 이력을 기록하는 중...'

    await persistFilterLog({
      status: 'success',
      durationSec,
      rankCounts: matching.rankCounts,
      totalMatched: matching.matches.length,
      totalUnmatchedExp: matching.unmatchedReasons.size,
      totalPurchasesProcessed: purchases.filter((row) => !row.is_manual).length,
      totalExpProcessed: experiences.length,
      newMatches: matching.newMatches,
      removedMatches: matching.removedMatches,
      protectedCount: matching.protectedCount,
      ambiguousCount: matching.ambiguousCount,
    })

    progressPercent.value = 100
    progressLabel.value = '완료되었습니다.'

    // 반드시 running → idle 전환 후 데이터 갱신
    filterState.value = 'idle'
    progressPercent.value = 0
    progressLabel.value = ''

    await fetchFilterData()
    setFilterResult(month, { pendingReview: manualRows.value.length })
    setPendingReview(month, manualRows.value.length)
    if (manualRows.value.length > 0) activeTab.value = 'manual'

    await createNotification({
      type: manualRows.value.length > 0 ? 'warning' : 'success',
      title: '필터링 완료',
      message: `${month} 매칭 ${matching.matches.length}건, 확인 필요 ${manualRows.value.length}건`,
      link: '/filter',
      payload: {
        targetMonth: month,
        matched: matching.matches.length,
        pendingReview: manualRows.value.length,
        unmatchedExperiences: matching.unmatchedReasons.size,
      },
    })

    toast.success(`분석 완료(${FILTER_VER}): 매칭 ${matching.matches.length}건, 확인 필요 ${manualRows.value.length}건`)
  } catch (error: any) {
    console.error('Failed to run filter:', error)
    filterState.value = 'failed'
    let rollbackFailed = false
    if (hasPurchaseMutation || hasExperienceMutation) {
      try {
        progressPercent.value = 92
        progressLabel.value = '실패로 인해 이전 상태를 복구하는 중...'
        await restoreFilterSnapshots(purchaseSnapshots, experienceReasonSnapshots)
        toast.info('필터링 실패로 인해 이전 판정 상태로 자동 복구했습니다.')
      } catch (rollbackError) {
        rollbackFailed = true
        console.error('Failed to restore filter snapshots:', rollbackError)
      }
    }
    toast.error(
      rollbackFailed
        ? `필터링 실행 실패 + 자동 복구 실패: ${error?.message || '알 수 없는 오류'}`
        : `필터링 실행 실패: ${error?.message || '알 수 없는 오류'}`,
    )
    try {
      let purchases = loadedPurchases
      let experiences = loadedExperiences
      if (purchases.length === 0 || experiences.length === 0) {
        const loaded = await loadRawData(month)
        if (purchases.length === 0) purchases = loaded.purchases
        if (experiences.length === 0) experiences = loaded.experiences
      }
      await persistFilterLog({
        status: 'error',
        durationSec: (Date.now() - startedAt) / 1000,
        totalMatched: 0,
        totalUnmatchedExp: experiences.length,
        totalPurchasesProcessed: purchases.filter((row) => !row.is_manual).length,
        totalExpProcessed: experiences.length,
        errorMessage: error?.message || '필터링 실행 오류',
      })
    } catch {
      // ignore logging failure
    }

    await createNotification({
      type: 'error',
      title: '필터링 실패',
      message: `${month} 필터링 중 오류가 발생했습니다. 실행 이력에서 상세 원인을 확인해 주세요.`,
      link: '/logs',
      payload: {
        targetMonth: month,
        error: error?.message || '필터링 실행 오류',
      },
    })
  } finally {
    if (monthFilterLockToken) {
      await $fetch('/api/filter/lock', {
        method: 'POST',
        body: {
          action: 'release',
          month,
          token: monthFilterLockToken,
        },
      }).catch((error) => {
        console.warn('Failed to release month filter lock:', error)
      })
    }

    if (filterState.value !== 'failed') syncFilterState()
  }
}

function openDetail(item: any, type: SourceType) {
  selectedItem.value = { ...item }
  selectedSource.value = type
  originalResult.value = (type === 'rank' || type === 'realPurchase' || type === 'manual') ? item.result : null
  showDetail.value = true
}

function closeDetail() {
  showDetail.value = false
  selectedItem.value = null
  selectedSource.value = null
  originalResult.value = null
}

async function saveDetailResult() {
  if (!selectedItem.value || !hasPendingResultChange.value) {
    closeDetail()
    return
  }
  if (isViewer.value) return

  const purchaseId = String(selectedItem.value.purchaseId || '')
  if (!purchaseId) {
    closeDetail()
    return
  }

  const beforeIsFake = originalResult.value === 'fake'
  const afterIsFake = selectedItem.value.result === 'fake'
  const previousMatchedExpId = selectedItem.value.matchedExpId ? Number(selectedItem.value.matchedExpId) : null

  const payload: Record<string, any> = {
    is_fake: afterIsFake,
    is_manual: true,
    needs_review: false,
  }
  if (!afterIsFake) {
    payload.match_rank = null
    payload.match_reason = null
    payload.matched_exp_id = null
    payload.quantity_warning = false
  } else if (!selectedItem.value.matchedExpId) {
    payload.match_rank = null
    payload.match_reason = selectedItem.value.matchReason || '수동지정_체험단원불명'
    payload.matched_exp_id = null
  }

  const { error: updateError } = await supabase
    .from('purchases')
    .update(payload)
    .eq('purchase_id', purchaseId)

  if (updateError) {
    toast.error(`저장 실패: ${updateError.message}`)
    return
  }

  const logPayload: Record<string, any> = {
    changed_by_account_id: user.value.id || null,
    changed_by: user.value.name || user.value.email || 'unknown',
    purchase_id: purchaseId,
    action: afterIsFake ? 'fake지정' : 'fake해제',
    prev_is_fake: beforeIsFake,
    new_is_fake: afterIsFake,
    prev_matched_exp_id: previousMatchedExpId,
    new_matched_exp_id: afterIsFake ? previousMatchedExpId : null,
    note: '필터 상세 패널에서 수동 변경',
    target_month: selectedMonth.value === 'all' ? null : selectedMonth.value,
  }

  let { error: logError } = await supabase
    .from('override_logs')
    .insert(logPayload)

  if (logError && logError.code === '42703') {
    delete logPayload.target_month
    const fallback = await supabase
      .from('override_logs')
      .insert(logPayload)
    logError = fallback.error
  }

  if (logError) console.error('Failed to insert override log:', logError)

  await fetchFilterData()
  setPendingReview(selectedMonth.value, manualRows.value.length)
  toast.success('분류 결과가 저장되었습니다.')
  closeDetail()
}

async function markReviewed(item: ResultRow) {
  if (isViewer.value) return
  const purchaseId = String(item.purchaseId || '')
  if (!purchaseId) return

  const { error } = await supabase
    .from('purchases')
    .update({
      needs_review: false,
      is_manual: true,
    })
    .eq('purchase_id', purchaseId)

  if (error) {
    toast.error(`확인 완료 처리 실패: ${error.message}`)
    return
  }

  await fetchFilterData()
  setPendingReview(selectedMonth.value, manualRows.value.length)
  toast.info(`${item.buyer} 건을 확인 완료 처리했습니다.`)
}

function downloadFilteredCsv() {
  const rows = [
    ...rankResults.value.map((row) => ({
      주문번호: row.orderId,
      구매자: row.buyer,
      구매자ID: row.buyerId,
      상품명: row.product,
      옵션: row.optionInfo,
      매칭단계: row.rank > 0 ? `${row.rank}단계` : '-',
      매칭사유: row.matchReason || '-',
      매칭체험단원: row.matchedName || '-',
      최종결과: row.result === 'fake' ? '체험단' : '실구매',
      확인필요: row.needsReview ? 'Y' : 'N',
      구분: '자동매칭',
    })),
    ...manualRows.value.map((row) => ({
      주문번호: row.orderId,
      구매자: row.buyer,
      구매자ID: row.buyerId,
      상품명: row.product,
      옵션: row.optionInfo,
      매칭단계: row.rank > 0 ? `${row.rank}단계` : '-',
      매칭사유: row.matchReason || '-',
      매칭체험단원: row.matchedName || '-',
      최종결과: row.result === 'fake' ? '체험단' : '실구매',
      확인필요: row.needsReview ? 'Y' : 'N',
      구분: '수동확인',
    })),
  ]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, '체험단분석결과')
  const suffix = selectedMonth.value === 'all' ? 'all' : selectedMonth.value
  XLSX.writeFile(wb, `체험단분석_정리_${suffix}.xlsx`)
  toast.success('정리된 엑셀 파일을 다운로드했습니다.')
}

watch(
  () => [selectedMonth.value, profileLoaded.value, profileRevision.value],
  async ([month, loaded]) => {
    if (!month || !loaded) return
    revealResultSection.value = false
    showConfirmModal.value = false
    closeDetail()
    await fetchFilterData()
  },
  { immediate: true },
)
</script>

<style scoped>
.filter-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.tab-search {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-border);
}

.tab-search-input {
  max-width: 400px;
}

.filter-state-card {
  padding: var(--space-lg) var(--space-xl);
}

.filter-state-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-xs);
}

.filter-state-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.filter-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.filter-stats-row {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}

.filter-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.filter-stat-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.filter-stat-value {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text);
}

.filter-stat-divider {
  width: 1px;
  height: 36px;
  background: var(--color-border);
}

.filter-run-btn {
  margin-left: auto;
}

.filter-progress {
  margin-top: var(--space-xl);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-border-light);
}

.card-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

/* Result Summary */
.result-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-md);
}

.result-summary-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-lg);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.result-summary-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.result-summary-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text);
}

.result-summary-value.danger {
  color: var(--color-danger);
}

.result-summary-value.primary {
  color: var(--color-primary);
}

.result-summary-value small {
  font-size: 0.75rem;
  font-weight: 500;
  margin-left: 1px;
}

.unmatch-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}

.unmatch-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-secondary);
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  line-height: 1.2;
  font-weight: 600;
}

.unmatch-summary {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  line-height: 1.35;
}

.detail-tags {
  margin-bottom: var(--space-sm);
}

.detail-summary {
  margin: 0;
}

@media (max-width: 1024px) {
  .filter-header-actions {
    flex-wrap: wrap;
  }

  .filter-stats-row {
    flex-wrap: wrap;
  }

  .result-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .filter-page {
    gap: var(--space-lg);
  }

  .filter-header-actions {
    width: 100%;
    justify-content: space-between;
  }

  .filter-stats-row {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-md);
  }

  .filter-stat-divider {
    display: none;
  }

  .filter-run-btn {
    width: 100%;
    margin-left: 0;
    justify-content: center;
  }

  .result-summary-grid {
    grid-template-columns: 1fr;
  }

  .result-summary-card {
    align-items: flex-start;
  }

  .tab-search {
    padding: var(--space-sm) var(--space-md);
  }

  .tab-search-input {
    max-width: none;
  }
}
</style>
