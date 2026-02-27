<template>
  <div class="products-page">
    <div v-if="isViewer" class="status-banner">
      <PackageOpen :size="16" :stroke-width="2" />
      <span>열람자 권한에서는 상품 등록/수정을 할 수 없습니다.</span>
    </div>

    <!-- Page Header -->
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">상품 목록</h1>
        <span class="page-count badge badge-neutral">{{ filteredProducts.length }}개</span>
      </div>
      <button v-if="canModify" class="btn btn-primary" @click="openAddModal">
        <PlusCircle :size="16" :stroke-width="2" />
        신규 상품 등록
      </button>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="card" style="text-align: center; padding: 60px;">
      <span class="text-muted">상품 데이터를 불러오는 중...</span>
    </div>

    <!-- Filters -->
    <template v-else>
      <div class="filter-bar">
        <SearchInput
          v-model="searchQuery"
          class="search-box"
          placeholder="상품명 또는 상품번호로 검색..."
          width="100%"
        />
        <select v-model="filterPetType" class="select">
            <option value="">전체 펫 타입</option>
            <option value="DOG">강아지</option>
            <option value="CAT">고양이</option>
            <option value="BOTH">공용</option>
        </select>
      </div>

      <!-- Table -->
      <div class="card">
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>상품번호</th>
                <th>상품명</th>
                <th>옵션</th>
                <th>펫 타입</th>
                <th>성장 단계</th>
                <th>상품 라인</th>
                <th>등록일</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in filteredProducts" :key="p.product_id" class="clickable" @click="selectProduct(p)">
                <td><span class="text-muted font-mono">{{ p.product_id }}</span></td>
                <td><strong>{{ p.product_name }}</strong></td>
                <td>{{ p.option_name || '-' }}</td>
                <td>
                  <span class="badge" :class="petBadgeClass(p.pet_type)">{{ petLabel(p.pet_type) }}</span>
                </td>
                <td>{{ stageLabel(p.stage) }}</td>
                <td>{{ p.product_line || '-' }}</td>
                <td class="text-muted">{{ formatDate(p.created_at) }}</td>
                <td>
                  <button v-if="canModify" class="btn btn-ghost btn-sm" @click.stop="selectProduct(p)">
                    <Edit3 :size="14" :stroke-width="1.8" />
                  </button>
                  <button v-if="canModify" class="btn btn-ghost btn-sm btn-danger" :disabled="deleting" @click.stop="openDeleteModal(p)">
                    <Trash2 :size="14" :stroke-width="1.8" />
                  </button>
                  <span v-else class="text-sm text-muted">열람</span>
                </td>
              </tr>
              <tr v-if="filteredProducts.length === 0">
                <td colspan="8" class="empty-row">
                  <PackageOpen :size="32" :stroke-width="1.2" />
                  <span>검색 결과가 없습니다.</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Slide Panel: Edit Product -->
    <Transition name="slide">
      <div v-if="selectedProduct" class="slide-panel-overlay" @click="selectedProduct = null">
        <div class="slide-panel" @click.stop>
          <div class="slide-panel-header">
            <span class="slide-panel-title">상품 상세</span>
            <button class="btn btn-ghost btn-sm" @click="selectedProduct = null">
              <X :size="18" :stroke-width="1.8" />
            </button>
          </div>
          <div class="slide-panel-body">
            <div class="detail-group">
              <label class="label">상품번호</label>
              <p class="detail-value font-mono">{{ selectedProduct.product_id }}</p>
            </div>
            <div class="detail-group">
              <label class="label">상품명</label>
              <input v-model="selectedProduct.product_name" class="input" :disabled="!canModify" />
            </div>
            <div class="detail-group">
              <label class="label">옵션</label>
              <input v-model="selectedProduct.option_name" class="input" :disabled="!canModify" placeholder="예: 8L, 3개 / 북어 / 블루" />
            </div>
            <div class="detail-group">
              <label class="label">펫 타입</label>
              <select v-model="selectedProduct.pet_type" class="select" style="width:100%" :disabled="!canModify">
                <option value="DOG">강아지</option>
                <option value="CAT">고양이</option>
                <option value="BOTH">공용</option>
              </select>
            </div>
            <div class="detail-group">
              <label class="label">성장 단계</label>
              <select v-model="selectedProduct.stage" class="select" style="width:100%" :disabled="!canModify">
                <option :value="1">영유아</option>
                <option :value="2">성장기</option>
                <option :value="3">성견/성묘</option>
                <option :value="4">시니어</option>
                <option :value="null">기타</option>
              </select>
            </div>
            <div class="detail-group">
              <label class="label">상품 라인</label>
              <input v-model="selectedProduct.product_line" class="input" :disabled="!canModify" />
            </div>
          </div>
          <div class="slide-panel-footer">
            <div class="panel-actions">
              <button
                v-if="canModify && selectedProduct"
                class="btn btn-danger"
                :disabled="deleting"
                @click="openDeleteModal(selectedProduct)"
              >
                {{ deleting ? '삭제 중...' : '삭제' }}
              </button>
              <button class="btn btn-secondary" @click="selectedProduct = null">취소</button>
              <button v-if="canModify" class="btn btn-primary" :disabled="saving" @click="saveProduct">
                {{ saving ? '저장 중...' : '저장' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Add Product Modal -->
    <Transition name="fade">
      <div v-if="showAddModal && canModify" class="modal-overlay" @click="showAddModal = false">
        <div class="modal-content card" @click.stop>
          <h3 class="modal-title">신규 상품 등록</h3>
          <div class="modal-form">
            <div class="detail-group">
              <label class="label">상품번호 (자동생성)</label>
              <input v-model="newProduct.product_id" class="input" readonly />
            </div>
            <div class="detail-group">
              <label class="label">상품명 <span class="required">*</span></label>
              <input v-model="newProduct.product_name" class="input" placeholder="상품명 입력" />
            </div>
            <div class="detail-group">
              <label class="label">옵션</label>
              <input v-model="newProduct.option_name" class="input" placeholder="예: 8L, 3개 / 북어 / 블루" />
            </div>
            <div class="detail-row">
              <div class="detail-group flex-1">
                <label class="label">펫 타입</label>
                <select v-model="newProduct.pet_type" class="select" style="width:100%">
                  <option value="DOG">강아지</option>
                  <option value="CAT">고양이</option>
                  <option value="BOTH">공용</option>
                </select>
              </div>
              <div class="detail-group flex-1">
                <label class="label">성장 단계</label>
                <select v-model="newProduct.stage" class="select" style="width:100%">
                  <option :value="1">영유아</option>
                  <option :value="2">성장기</option>
                  <option :value="3">성견/성묘</option>
                  <option :value="4">시니어</option>
                  <option :value="null">기타</option>
                </select>
              </div>
            </div>
            <div class="detail-group">
              <label class="label">상품 라인</label>
              <input v-model="newProduct.product_line" class="input" placeholder="예: 관절건강" />
            </div>
          </div>
          <div v-if="addError" class="login-error" style="margin-bottom: 16px;">
            {{ addError }}
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showAddModal = false">취소</button>
            <button class="btn btn-primary" :disabled="saving" @click="addProduct">
              {{ saving ? '등록 중...' : '등록' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <ConfirmModal
      v-model="showDeleteModal"
      title="상품 삭제"
      variant="danger"
      confirm-label="삭제"
      cancel-label="취소"
      @confirm="deleteProduct"
    >
      <p><strong>{{ deleteTarget?.product_name }}</strong> 상품을 삭제하시겠습니까?</p>
      <p class="text-muted mt-xs">삭제된 상품은 목록에서 숨겨지며(`deleted_at` 설정), 기존 주문 이력은 유지됩니다.</p>
    </ConfirmModal>
  </div>
</template>

<script setup lang="ts">
import { PlusCircle, Edit3, X, PackageOpen, Trash2 } from 'lucide-vue-next'
import { matchesSearchQuery } from '~/composables/useTextSearch'

definePageMeta({ layout: 'default' })

const supabase = useSupabaseClient()
const toast = useToast()
const { isViewer, canModify } = useCurrentUser()

interface Product {
  product_id: string
  product_name: string
  option_name: string | null
  pet_type: string
  stage: number | null
  product_line: string | null
  deleted_at: string | null
  created_at: string
}

const searchQuery = ref('')
const filterPetType = ref('')
const selectedProduct = ref<Product | null>(null)
const showAddModal = ref(false)
const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)
const addError = ref('')
const showDeleteModal = ref(false)
const deleteTarget = ref<Product | null>(null)
const supportsOptionColumn = ref(true)

const newProduct = ref<{
  product_id: string
  product_name: string
  option_name: string
  pet_type: string
  stage: number | null
  product_line: string
}>({
  product_id: '',
  product_name: '',
  option_name: '',
  pet_type: 'DOG',
  stage: 3,
  product_line: '',
})

const products = ref<Product[]>([])

function generateProductId(): string {
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `P-${Date.now()}${rand}`
}

function openAddModal() {
  newProduct.value = {
    product_id: generateProductId(),
    product_name: '',
    option_name: '',
    pet_type: 'DOG',
    stage: 3,
    product_line: '',
  }
  addError.value = ''
  showAddModal.value = true
}

// Fetch products from Supabase
async function fetchProducts() {
  loading.value = true
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .is('deleted_at', null)
    .order('product_name', { ascending: true })

  if (data && !error) {
    products.value = data as Product[]
  }
  loading.value = false
}

onMounted(() => {
  fetchProducts()
})

const filteredProducts = computed(() => {
  return products.value
    .filter(p => {
      const matchSearch = matchesSearchQuery(
        searchQuery.value,
        p.product_name,
        p.option_name || '',
        p.product_id,
      )
      const matchPet = !filterPetType.value || p.pet_type === filterPetType.value
      return matchSearch && matchPet
    })
    .sort((a, b) => {
      const byName = a.product_name.localeCompare(b.product_name, 'ko')
      if (byName !== 0) return byName
      return (a.option_name || '').localeCompare(b.option_name || '', 'ko')
    })
})

function petBadgeClass(type: string) {
  switch (type) {
    case 'DOG': return 'badge-primary'
    case 'CAT': return 'badge-warning'
    case 'BOTH': return 'badge-neutral'
    default: return 'badge-neutral'
  }
}

function petLabel(type: string) {
  const map: Record<string, string> = { DOG: '강아지', CAT: '고양이', BOTH: '공용' }
  return map[type] || type
}

function stageLabel(stage: number | null) {
  if (stage === null || stage === undefined) return '기타'
  const map: Record<number, string> = { 1: '영유아', 2: '성장기', 3: '성견/성묘', 4: '시니어' }
  return map[stage] || '-'
}

function formatDate(dateStr: string) {
  return dateStr ? dateStr.split('T')[0] : '-'
}

function selectProduct(p: Product) {
  selectedProduct.value = { ...p }
}

async function saveProduct() {
  if (!canModify.value || !selectedProduct.value) return
  saving.value = true

  const { product_id, product_name, option_name, pet_type, stage, product_line } = selectedProduct.value
  const payload: Record<string, any> = { product_name, pet_type, stage, product_line }
  if (supportsOptionColumn.value) payload.option_name = option_name || null

  let { data, error } = await supabase
    .from('products')
    .update(payload)
    .eq('product_id', product_id)
    .is('deleted_at', null)
    .select('product_id')

  if (error && supportsOptionColumn.value && error.code === '42703') {
    supportsOptionColumn.value = false
    const fallback = await supabase
      .from('products')
      .update({ product_name, pet_type, stage, product_line })
      .eq('product_id', product_id)
      .is('deleted_at', null)
      .select('product_id')
    data = fallback.data
    error = fallback.error
  }

  if (error) {
    console.error('Product update error:', error)
    toast.error('상품 저장에 실패했습니다.')
  } else if (!data || data.length === 0) {
    toast.error('상품 저장이 반영되지 않았습니다. 권한 또는 대상 상품 상태를 확인해 주세요.')
  } else {
    const idx = products.value.findIndex(p => p.product_id === product_id)
    if (idx >= 0) products.value[idx] = { ...selectedProduct.value }
    selectedProduct.value = null
    toast.success('상품이 저장되었습니다.')
  }
  saving.value = false
}

async function addProduct() {
  if (!canModify.value) return
  addError.value = ''
  if (!newProduct.value.product_name) {
    addError.value = '상품명은 필수입니다.'
    return
  }
  if (!newProduct.value.product_id) newProduct.value.product_id = generateProductId()

  saving.value = true
  const payload: Record<string, any> = {
    product_id: newProduct.value.product_id,
    product_name: newProduct.value.product_name,
    pet_type: newProduct.value.pet_type,
    stage: newProduct.value.stage,
    product_line: newProduct.value.product_line || null,
  }
  if (supportsOptionColumn.value) payload.option_name = newProduct.value.option_name || null

  let { error } = await supabase.from('products').insert(payload)

  if (error && supportsOptionColumn.value && error.code === '42703') {
    supportsOptionColumn.value = false
    const fallback = await supabase.from('products').insert({
      product_id: newProduct.value.product_id,
      product_name: newProduct.value.product_name,
      pet_type: newProduct.value.pet_type,
      stage: newProduct.value.stage,
      product_line: newProduct.value.product_line || null,
    })
    error = fallback.error
  }

  if (error) {
    if (error.code === '23505') {
      addError.value = '이미 존재하는 상품번호입니다.'
    } else {
      addError.value = '상품 등록에 실패했습니다.'
    }
  } else {
    newProduct.value = { product_id: generateProductId(), product_name: '', option_name: '', pet_type: 'DOG', stage: 3, product_line: '' }
    showAddModal.value = false
    await fetchProducts()
  }
  saving.value = false
}

function openDeleteModal(product: Product) {
  if (!canModify.value) return
  deleteTarget.value = { ...product }
  showDeleteModal.value = true
}

async function deleteProduct() {
  if (!canModify.value || !deleteTarget.value) return

  deleting.value = true
  const target = deleteTarget.value
  const { data, error } = await supabase
    .from('products')
    .update({ deleted_at: new Date().toISOString() })
    .eq('product_id', target.product_id)
    .is('deleted_at', null)
    .select('product_id, deleted_at')

  if (error) {
    console.error('Product delete error:', error)
    toast.error(`상품 삭제 실패: ${error.message}`)
    deleting.value = false
    return
  }
  if (!data || data.length === 0) {
    toast.error('삭제가 반영되지 않았습니다. 권한(RLS) 또는 이미 삭제된 상품인지 확인해 주세요.')
    deleting.value = false
    return
  }

  products.value = products.value.filter((p) => p.product_id !== target.product_id)
  if (selectedProduct.value?.product_id === target.product_id) {
    selectedProduct.value = null
  }
  showDeleteModal.value = false
  deleteTarget.value = null
  deleting.value = false
  toast.success('상품이 삭제되었습니다.')
}
</script>

<style scoped>
.products-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.page-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text);
}

.page-count {
  font-size: 0.75rem;
}

.filter-bar {
  display: flex;
  gap: var(--space-md);
  align-items: center;
}

.search-box {
  flex: 1;
  max-width: 360px;
}

.font-mono {
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.empty-row {
  text-align: center;
  padding: var(--space-3xl) !important;
  color: var(--color-text-muted);
}
.empty-row span {
  display: block;
  margin-top: var(--space-sm);
  font-size: 0.8125rem;
}

/* Detail Groups */
.detail-group {
  margin-bottom: var(--space-lg);
}

.detail-value {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  padding: 8px 0;
}

.detail-row {
  display: flex;
  gap: var(--space-md);
}

.flex-1 {
  flex: 1;
}

/* Panel Actions */
.panel-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
}

/* Modal */
.modal-title {
  font-size: 1.0625rem;
  font-weight: 600;
  margin-bottom: var(--space-xl);
}

.modal-form {
  margin-bottom: var(--space-lg);
}

.login-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-radius: 8px;
  font-size: 0.8125rem;
  color: #991B1B;
}

/* Transitions */
.slide-enter-active .slide-panel { animation: slideInRight 0.25s ease; }
.slide-leave-active .slide-panel { animation: slideInRight 0.2s ease reverse; }
.slide-enter-active { animation: fadeIn 0.15s ease; }
.slide-leave-active { animation: fadeIn 0.15s ease reverse; }

.fade-enter-active { animation: fadeIn 0.15s ease; }
.fade-leave-active { animation: fadeIn 0.1s ease reverse; }
.fade-enter-active .modal-content { animation: scaleIn 0.15s ease; }
.fade-leave-active .modal-content { animation: scaleIn 0.1s ease reverse; }

@media (max-width: 768px) {
  .filter-bar {
    flex-direction: column;
  }
  .search-box {
    max-width: 100%;
  }
}
</style>
