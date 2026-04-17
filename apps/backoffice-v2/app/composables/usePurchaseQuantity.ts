import { extractProductKeyword } from './useFilterMatching'
import {
  getCanonicalGroupBySourceProductId,
  getPackMultiplierBySourceProductId,
  isThreeFlavorSetSourceProduct,
} from './useCommerceProductCatalog'

export interface PurchaseQuantityInput {
  productName: string
  optionInfo?: string | null
  quantity?: number | null
  sourceProductId?: string | null
  sourceOptionCode?: string | null
}

export interface QuantityBreakdownRow {
  optionLabel: string
  count: number
}

export interface PurchaseQuantityResult {
  totalCount: number
  dashboardBreakdown: QuantityBreakdownRow[]
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^0-9a-z가-힣]/g, '')
}

function normalizeOptionLabel(value: unknown): string {
  return String(value || '').trim() || '-'
}

function normalizeCount(value: number, fallback = 1): number {
  if (!Number.isFinite(value) || value <= 0) return fallback
  if (Math.abs(value - Math.round(value)) < 1e-9) return Math.round(value)
  return Math.round(value * 100) / 100
}

function safeQuantity(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 1
  return parsed
}

function extractLastPieceCount(productName: string): number | null {
  const matches = [...String(productName || '').matchAll(/(\d+)\s*개/g)]
  if (matches.length === 0) return null
  const last = Number.parseInt(matches[matches.length - 1]?.[1] || '', 10)
  return Number.isFinite(last) && last > 0 ? last : null
}

function extractGram(productName: string): number | null {
  const match = String(productName || '').match(/(\d+(?:\.\d+)?)\s*g/i)
  if (!match) return null
  const gram = Number.parseFloat(match[1] || '')
  return Number.isFinite(gram) && gram > 0 ? gram : null
}

function extractBoxCount(productName: string): number | null {
  const match = String(productName || '').match(/(\d+)\s*박스/)
  if (!match) return null
  const count = Number.parseInt(match[1] || '', 10)
  return Number.isFinite(count) && count > 0 ? count : null
}

function countOccurrences(source: string, keyword: string): number {
  if (!source || !keyword) return 0
  let count = 0
  let start = 0
  for (;;) {
    const idx = source.indexOf(keyword, start)
    if (idx === -1) break
    count += 1
    start = idx + keyword.length
  }
  return count
}

function detectProductGroup(productName: string, sourceProductId?: string | null): string {
  const groupByProductId = getCanonicalGroupBySourceProductId(sourceProductId)
  if (groupByProductId === '맛보기') return '맛보기'
  if (groupByProductId === '도시락샘플') return '샘플팩'
  if (groupByProductId === '트릿백') return '트릿백'
  if (groupByProductId === '츄르짜개') return '츄르짜개'
  if (groupByProductId === '애착트릿') return '애착트릿'
  if (groupByProductId === '엔자이츄') return '엔자이츄'
  if (groupByProductId === '이즈바이트') return '이즈바이트'
  if (groupByProductId === '케어푸') return '케어푸'
  if (groupByProductId === '두부모래') return '두부모래'
  if (groupByProductId === '츄라잇') return '츄라잇'

  const kw = extractProductKeyword(productName)
  if (kw) return kw
  const normalized = normalizeText(productName)
  if (normalized.includes('디스펜서')) return '츄르짜개'
  if (normalized.includes('트릿백')) return '트릿백'
  if (normalized.includes('맛보기')) return '맛보기'
  return ''
}

function detectAttachmentFlavor(productName: string, optionInfo: string): string | null {
  const source = normalizeText(`${productName} ${optionInfo}`)
  if (!source || source.includes('3종세트')) return null
  if (source.includes('북어')) return '북어'
  if (source.includes('연어')) return '연어'
  if (source.includes('치킨') || source.includes('닭고기') || source.includes('닭가슴살')) return '치킨'
  return null
}

function buildChuraitBoxBreakdown(optionInfo: string, quantity: number): QuantityBreakdownRow[] {
  const normalizedOption = normalizeText(optionInfo)
  if (!normalizedOption) return []

  const dailyFitCount = countOccurrences(normalizedOption, '데일리핏') + countOccurrences(normalizedOption, '데일리펫')
  const brightCount = countOccurrences(normalizedOption, '브라이트')
  const cleanPetCount = countOccurrences(normalizedOption, '클린펫')

  const rows: QuantityBreakdownRow[] = []
  if (dailyFitCount > 0) rows.push({ optionLabel: '데일리핏', count: dailyFitCount * quantity })
  if (brightCount > 0) rows.push({ optionLabel: '브라이트', count: brightCount * quantity })
  if (cleanPetCount > 0) rows.push({ optionLabel: '클린펫', count: cleanPetCount * quantity })
  return rows
}

function resolveEnzaichuCount(productName: string, quantity: number): number {
  const pieceCount = extractLastPieceCount(productName)
  if (!pieceCount) return quantity

  // "1개/2개/3개..."처럼 실제 판매 수량이 직접 적힌 SKU는 그대로 사용한다.
  // 무게 기준 fallback은 "100g, 20개" 같은 내부 조각 수 표기에만 적용한다.
  if (pieceCount <= 6) return pieceCount * quantity

  const gram = extractGram(productName)
  if (gram && gram !== 10) {
    const byGram = (gram / 100) * quantity
    if (Number.isFinite(byGram) && byGram > 0) return byGram
  }

  if (pieceCount % 10 === 0) return (pieceCount / 10) * quantity
  return pieceCount * quantity
}

function resolveEaseBiteCount(productName: string, quantity: number): number {
  const pieceCount = extractLastPieceCount(productName)
  if (!pieceCount) return quantity

  // "1개/2개/3개/4개"처럼 판매 SKU 수량은 그대로 개수로 본다.
  // 무게 기준 fallback은 "13g, 14개" 같은 내부 조각 수 표기에만 적용한다.
  if (pieceCount <= 6) return pieceCount * quantity

  const gram = extractGram(productName)
  if (gram && gram !== 13) {
    const byGram = (gram / 90) * quantity
    if (Number.isFinite(byGram) && byGram > 0) return byGram
  }

  if (pieceCount % 7 === 0) return (pieceCount / 7) * quantity
  return pieceCount * quantity
}

function fallbackResult(optionInfo: string, totalCount: number): PurchaseQuantityResult {
  const safeTotal = normalizeCount(totalCount)
  return {
    totalCount: safeTotal,
    dashboardBreakdown: [
      {
        optionLabel: normalizeOptionLabel(optionInfo),
        count: safeTotal,
      },
    ],
  }
}

export function computePurchaseQuantity(input: PurchaseQuantityInput): PurchaseQuantityResult {
  const productName = String(input.productName || '')
  const optionInfo = String(input.optionInfo || '')
  const quantity = safeQuantity(input.quantity)
  const sourceProductId = String(input.sourceProductId || '').trim()
  const group = detectProductGroup(productName, sourceProductId)
  const normalizedProduct = normalizeText(productName)
  const packMultiplier = getPackMultiplierBySourceProductId(sourceProductId)

  // 츄라잇: 박스 상품은 옵션 내 맛 조합 기준으로 분해 집계
  if (group === '츄라잇') {
    const boxCount = extractBoxCount(productName) || packMultiplier
    if (boxCount) {
      const optionBreakdown = buildChuraitBoxBreakdown(optionInfo, quantity)
      if (optionBreakdown.length > 0) {
        return {
          totalCount: normalizeCount(optionBreakdown.reduce((sum, row) => sum + row.count, 0)),
          dashboardBreakdown: optionBreakdown.map((row) => ({ ...row, count: normalizeCount(row.count) })),
        }
      }
      return fallbackResult(optionInfo, boxCount * quantity)
    }
    return fallbackResult(optionInfo, quantity)
  }

  // 디스펜서 / 트릿백은 쿠팡 SKU별 개수 규칙이 있으면 그 값을 우선 사용한다.
  if (group === '츄르짜개' || group === '트릿백') {
    return fallbackResult(optionInfo, (packMultiplier || 1) * quantity)
  }

  // 전제품 맛보기 샘플 / 도시락 샘플은 주문 수량 그대로 본다.
  if (group === '맛보기' || group === '샘플팩') {
    return fallbackResult(optionInfo, quantity)
  }

  // 애착트릿
  if (group === '애착트릿') {
    if (normalizedProduct.includes('3종세트') || isThreeFlavorSetSourceProduct(sourceProductId)) {
      const perFlavor = normalizeCount(quantity)
      return {
        totalCount: normalizeCount(perFlavor * 3),
        dashboardBreakdown: [
          { optionLabel: '북어', count: perFlavor },
          { optionLabel: '연어', count: perFlavor },
          { optionLabel: '치킨', count: perFlavor },
        ],
      }
    }

    const pieceCount = extractLastPieceCount(productName)
    const total = packMultiplier
      ? packMultiplier * quantity
      : pieceCount
        ? pieceCount * quantity
        : quantity
    const flavor = detectAttachmentFlavor(productName, optionInfo)
    return {
      totalCount: normalizeCount(total),
      dashboardBreakdown: [
        {
          optionLabel: flavor || normalizeOptionLabel(optionInfo),
          count: normalizeCount(total),
        },
      ],
    }
  }

  // 엔자이츄
  if (group === '엔자이츄') {
    const total = packMultiplier
      ? packMultiplier * quantity
      : resolveEnzaichuCount(productName, quantity)
    return fallbackResult(optionInfo, total)
  }

  // 이즈바이트
  if (group === '이즈바이트') {
    const total = packMultiplier
      ? packMultiplier * quantity
      : resolveEaseBiteCount(productName, quantity)
    return fallbackResult(optionInfo, total)
  }

  // 케어푸 / 두부모래
  if (group === '케어푸' || group === '두부모래') {
    const pieceCount = extractLastPieceCount(productName)
    const total = (packMultiplier || pieceCount || 1) * quantity
    return fallbackResult(optionInfo, total)
  }

  if (packMultiplier) {
    return fallbackResult(optionInfo, packMultiplier * quantity)
  }

  // 그 외 상품은 수량 그대로
  return fallbackResult(optionInfo, quantity)
}

export function formatQuantityCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (Math.abs(value - Math.round(value)) < 1e-9) return `${Math.round(value)}`
  return `${Math.round(value * 100) / 100}`
}
