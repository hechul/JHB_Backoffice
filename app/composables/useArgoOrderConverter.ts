import * as XLSX from 'xlsx'

export type ShippingSourceType = 'dinner' | 'reviewnote' | 'unknown'

export interface ParsedShippingRow {
  rowIndex: number
  sourceType: ShippingSourceType
  receiverName: string
  phone: string
  address: string
  postalCode: string
  productHint: string
}

export interface ParsedShippingFile {
  sourceType: ShippingSourceType
  sourceLabel: string
  sheetName: string
  headers: string[]
  rows: ParsedShippingRow[]
  skippedRows: number
  fallbackProductHint: string
}

export interface ArgoProductCode {
  key: string
  label: string
  barcode: string
}

export interface ArgoOrderRow {
  '주문번호(*)': string
  '상품수량(*)': string
  '상품바코드(*)': string
  '수취인명(*)': string
  '수취인주소(*)': string
  '수취인 상세 주소': string
  '수취인 우편번호(*)': string
  '수취인 연락처(*)': string
  '배송요청사항': string
  '고객상품아이디': string
  '비고': string
  '출고요청 사유': string
}

export interface UnresolvedShippingRow {
  rowIndex: number
  receiverName: string
  productHint: string
  reason: string
}

export interface BuildArgoOrdersOptions {
  defaultProductKey?: string
  forceProductKey?: string
  forceQuantity?: number
  postcodeByAddress?: Record<string, string>
  orderPrefix?: string
  sequenceStart?: number
}

export interface BuildArgoOrdersResult {
  orders: ArgoOrderRow[]
  unresolvedRows: UnresolvedShippingRow[]
}

const ARGO_HEADERS = [
  '주문번호(*)',
  '상품수량(*)',
  '상품바코드(*)',
  '수취인명(*)',
  '수취인주소(*)',
  '수취인 상세 주소',
  '수취인 우편번호(*)',
  '수취인 연락처(*)',
  '배송요청사항',
  '고객상품아이디',
  '비고',
  '출고요청 사유',
] as const

const DINNER_SOURCE_KEYS = ['수령인', '가상번호', '수령주소']
const REVIEWNOTE_SOURCE_KEYS = ['이름', '연락처', '주소']

// 어떤 양식이든 대응: 공통 컬럼 동의어 목록
const RECEIVER_KEYS = ['수령인', '이름', '수취인명', '수취인', '받는분', '받는사람', '성명', '고객명', '구매자명', '주문자', '신청자', '수신인', '신청인']
const PHONE_KEYS = ['가상번호', '연락처', '휴대폰', '전화번호', '핸드폰', '휴대전화', '전화', '연락처1', '핸드폰번호', '휴대폰번호', '연락처(휴대폰)', '연락처(가상번호)']
const ADDRESS_KEYS = ['수령주소', '주소', '배송지', '배송주소', '배송지주소', '수취인주소', '주소지', '배송 주소', '受취인주소', '도로명주소', '지번주소']
const POSTCODE_KEYS = ['우편번호', '우편 번호', 'postcode', '우편', 'zip', '우편코드', '우편번 호']
const PRODUCT_KEYS = ['품목명', '품명', '상품명', '미션상품명', '캠페인명', '캠페인', '제품명', '신청메시지', '비고', '품목', '상품', '상품 명', '제품', '물품명', '상품(품목)']

const PRODUCT_CODES: ArgoProductCode[] = [
  { key: '애착트릿 북어', label: '애착트릿 북어', barcode: '8809616429555' },
  { key: '애착트릿 연어', label: '애착트릿 연어', barcode: '8809616429562' },
  { key: '애착트릿 치킨', label: '애착트릿 치킨', barcode: '8809616429579' },
  { key: '케어푸 포스트바이오틱스', label: '케어푸 포스트바이오틱스', barcode: '8809414594202' },
  { key: '츄라잇 클린펫', label: '츄라잇 클린펫', barcode: '8809560553115' },
  { key: '츄라잇 데일리핏', label: '츄라잇 데일리핏', barcode: '8809560553108' },
  { key: '츄라잇 브라이트', label: '츄라잇 브라이트', barcode: '8809560553122' },
  { key: '엔자이츄 츄잉 덴탈껌', label: '엔자이츄 츄잉 덴탈껌', barcode: '8809414594219' },
  { key: '이즈바이트 버블 덴탈껌', label: '이즈바이트 버블 덴탈껌', barcode: '8800273472519' },
  { key: '두부모래', label: '두부모래', barcode: 'A607366560520' },
  { key: '츄르짜개 블루', label: '츄르짜개 블루', barcode: 'A817173254651' },
  { key: '츄르짜개 옐로', label: '츄르짜개 옐로', barcode: 'A618028701048' },
  { key: '츄르짜개 퍼플', label: '츄르짜개 퍼플', barcode: 'A841542052631' },
  { key: '미니 트릿백 민트', label: '미니 트릿백 민트', barcode: 'A602382403678' },
  { key: '미니 트릿백 퍼플', label: '미니 트릿백 퍼플', barcode: 'A386066475217' },
]

const PRODUCT_CODE_MAP = new Map(PRODUCT_CODES.map((item) => [item.key, item]))

function normalizeText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^0-9a-z가-힣]/g, '')
}

function readWorkbook(file: File) {
  return file.arrayBuffer().then((buffer) => XLSX.read(buffer, { type: 'array', raw: false }))
}

function valueFromRow(row: Record<string, any>, keys: string[]): string {
  for (const key of keys) {
    const direct = row[key]
    if (direct !== undefined && String(direct).trim() !== '') return String(direct).trim()
    const foundKey = Object.keys(row).find((rowKey) => normalizeText(rowKey) === normalizeText(key))
    if (foundKey) {
      const value = row[foundKey]
      if (value !== undefined && String(value).trim() !== '') return String(value).trim()
    }
  }
  return ''
}

function detectSourceType(headers: string[]): ShippingSourceType {
  const normalizedHeaders = headers.map((header) => normalizeText(header))
  const hasDinner = DINNER_SOURCE_KEYS.every((key) => normalizedHeaders.includes(normalizeText(key)))
  if (hasDinner) return 'dinner'
  const hasReviewnote = REVIEWNOTE_SOURCE_KEYS.every((key) => normalizedHeaders.includes(normalizeText(key)))
  if (hasReviewnote) return 'reviewnote'
  return 'unknown'
}

function splitAddressWithPostcode(rawAddress: string): { address: string; postalCode: string } {
  const input = String(rawAddress || '').trim()
  if (!input) return { address: '', postalCode: '' }
  const matched = input.match(/^(\d{5})\s+(.+)$/)
  if (!matched) return { address: input, postalCode: '' }
  return { postalCode: matched[1]!, address: matched[2]!.trim() }
}

function inferProductHintFromFileName(name: string): string {
  const normalized = normalizeText(name)
  if (!normalized) return ''
  if (normalized.includes('엔자이츄')) return '엔자이츄'
  if (normalized.includes('이즈바이트')) return '이즈바이트'
  if (normalized.includes('두부모래')) return '두부모래'
  if (normalized.includes('애착트릿')) return '애착트릿'
  if (normalized.includes('츄라잇') || normalized.includes('데일리핏') || normalized.includes('클린펫') || normalized.includes('브라이트')) return '츄라잇'
  if (normalized.includes('케어푸') || normalized.includes('포스트바이오틱스')) return '케어푸'
  if (normalized.includes('트릿백')) return '트릿백'
  if (normalized.includes('츄르짜개') || normalized.includes('디스펜서')) return '츄르짜개'
  return ''
}

function resolveProductKey(productHint: string, fallbackProductKey?: string): { productKey: string | null; reason: string | null } {
  const source = normalizeText(productHint)

  if (source.includes('애착트릿')) {
    if (source.includes('북어')) return { productKey: '애착트릿 북어', reason: null }
    if (source.includes('연어')) return { productKey: '애착트릿 연어', reason: null }
    if (source.includes('치킨') || source.includes('닭고기') || source.includes('닭가슴살')) return { productKey: '애착트릿 치킨', reason: null }
    return { productKey: null, reason: '애착트릿 옵션(북어/연어/치킨) 확인 필요' }
  }

  if (source.includes('츄라잇')) {
    if (source.includes('데일리핏') || source.includes('데일리펫')) return { productKey: '츄라잇 데일리핏', reason: null }
    if (source.includes('클린펫')) return { productKey: '츄라잇 클린펫', reason: null }
    if (source.includes('브라이트')) return { productKey: '츄라잇 브라이트', reason: null }
    return { productKey: null, reason: '츄라잇 옵션(데일리핏/클린펫/브라이트) 확인 필요' }
  }

  if (source.includes('엔자이츄')) return { productKey: '엔자이츄 츄잉 덴탈껌', reason: null }
  if (source.includes('이즈바이트')) return { productKey: '이즈바이트 버블 덴탈껌', reason: null }
  if (source.includes('두부모래')) return { productKey: '두부모래', reason: null }
  if (source.includes('케어푸') || source.includes('포스트바이오틱스')) return { productKey: '케어푸 포스트바이오틱스', reason: null }

  if (source.includes('츄르짜개') || source.includes('디스펜서')) {
    if (source.includes('블루') || source.includes('blue')) return { productKey: '츄르짜개 블루', reason: null }
    if (source.includes('옐로') || source.includes('yellow')) return { productKey: '츄르짜개 옐로', reason: null }
    if (source.includes('퍼플') || source.includes('purple')) return { productKey: '츄르짜개 퍼플', reason: null }
    return { productKey: null, reason: '츄르짜개 옵션(블루/옐로/퍼플) 확인 필요' }
  }

  if (source.includes('트릿백')) {
    if (source.includes('민트') || source.includes('mint')) return { productKey: '미니 트릿백 민트', reason: null }
    if (source.includes('퍼플') || source.includes('purple')) return { productKey: '미니 트릿백 퍼플', reason: null }
    return { productKey: null, reason: '미니 트릿백 옵션(민트/퍼플) 확인 필요' }
  }

  if (fallbackProductKey) return { productKey: fallbackProductKey, reason: null }
  return { productKey: null, reason: '품목명에서 제품코드를 찾을 수 없음' }
}

function resolveQuantity(sourceType: ShippingSourceType, productKey: string): number {
  if (sourceType === 'reviewnote') return 1
  if (sourceType === 'dinner') {
    if (productKey === '두부모래') return 2
    return 1
  }
  return 1
}

function formatOrderPrefix(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

function sanitizePhone(phone: string): string {
  const value = String(phone || '').trim()
  if (!value) return ''
  const digits = value.replace(/[^0-9]/g, '')
  if (digits.length >= 8) return digits
  return value
}

export function getArgoProductCodes() {
  return PRODUCT_CODES.slice()
}

export function resolveArgoProductKeyFromInput(input: string): string | null {
  const raw = String(input || '').trim()
  if (!raw) return null
  const normalized = normalizeText(raw)
  if (!normalized) return null

  // 1) exact label/key match
  for (const item of PRODUCT_CODES) {
    const labelNormalized = normalizeText(item.label)
    const keyNormalized = normalizeText(item.key)
    if (normalized === labelNormalized || normalized === keyNormalized) return item.key
  }

  // 2) keyword match
  const resolved = resolveProductKey(raw)
  if (resolved.productKey) return resolved.productKey

  // 3) includes fallback
  const matched = PRODUCT_CODES.find((item) => normalizeText(item.label).includes(normalized) || normalized.includes(normalizeText(item.label)))
  return matched?.key || null
}

export async function parseShippingFile(file: File): Promise<ParsedShippingFile> {
  const workbook = await readWorkbook(file)
  const firstSheetName = workbook.SheetNames[0] || 'Sheet1'
  const firstSheet = workbook.Sheets[firstSheetName] || {}
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { raw: false, defval: '' })
  const headers = rows.length > 0 ? Object.keys(rows[0] || {}).map((header) => String(header || '').trim()) : []
  const sourceType = detectSourceType(headers)
  const fallbackProductHint = inferProductHintFromFileName(file.name)
  const sourceLabel = sourceType === 'dinner' ? '디너의여왕' : sourceType === 'reviewnote' ? '리뷰노트' : '일반양식'

  let skippedRows = 0
  const parsedRows: ParsedShippingRow[] = rows.map((row, index) => {
    // 소스 종류와 무관하게 이름/주소/연락처를 최대한 추출
    // 디너의여왕 전용 컬럼을 우선 시도하고, 없으면 공통 동의어로 폴백
    const receiverName = valueFromRow(row, RECEIVER_KEYS)
    const phone = valueFromRow(row, PHONE_KEYS)
    const rawAddress = valueFromRow(row, ADDRESS_KEYS)
    const postalCode = valueFromRow(row, POSTCODE_KEYS)
    // 품목은 보조 정보(파일명 힌트가 메인)
    const productHint = valueFromRow(row, PRODUCT_KEYS) || fallbackProductHint

    // 주소에 우편번호가 앞에 붙어있는 경우 분리 (예: "12345 서울시 강남구")
    const split = splitAddressWithPostcode(rawAddress)
    const finalAddress = split.address || String(rawAddress || '').trim()
    const finalPostcode = postalCode || split.postalCode

    if (!receiverName || !finalAddress) skippedRows += 1
    return {
      rowIndex: index + 2,
      sourceType: sourceType === 'unknown' ? 'reviewnote' : sourceType,
      receiverName,
      phone: sanitizePhone(phone),
      address: finalAddress,
      postalCode: String(finalPostcode || '').trim(),
      productHint,
    }
  }).filter((row) => row.receiverName && row.address)

  return {
    sourceType,
    sourceLabel,
    sheetName: firstSheetName,
    headers,
    rows: parsedRows,
    skippedRows,
    fallbackProductHint,
  }
}

export function collectAddressesWithoutPostcode(rows: ParsedShippingRow[]) {
  const unique = new Set<string>()
  for (const row of rows) {
    if (!row.postalCode && row.address) unique.add(row.address)
  }
  return Array.from(unique)
}

export function buildArgoOrders(
  shippingRows: ParsedShippingRow[],
  options: BuildArgoOrdersOptions = {},
): BuildArgoOrdersResult {
  const postcodeByAddress = options.postcodeByAddress || {}
  const prefix = options.orderPrefix || formatOrderPrefix(new Date())
  const sequenceStart = Number.isFinite(options.sequenceStart) ? Number(options.sequenceStart) : 1
  const orders: ArgoOrderRow[] = []
  const unresolvedRows: UnresolvedShippingRow[] = []

  let sequence = sequenceStart

  for (const row of shippingRows) {
    const postcode = row.postalCode || postcodeByAddress[row.address] || ''
    const resolved = options.forceProductKey
      ? { productKey: options.forceProductKey, reason: null as string | null }
      : resolveProductKey(row.productHint, options.defaultProductKey)
    if (!resolved.productKey) {
      unresolvedRows.push({
        rowIndex: row.rowIndex,
        receiverName: row.receiverName,
        productHint: row.productHint || '-',
        reason: resolved.reason || '제품코드 매핑 실패',
      })
      continue
    }

    const product = PRODUCT_CODE_MAP.get(resolved.productKey)
    if (!product) {
      unresolvedRows.push({
        rowIndex: row.rowIndex,
        receiverName: row.receiverName,
        productHint: row.productHint || '-',
        reason: `지원되지 않는 제품코드 키: ${resolved.productKey}`,
      })
      continue
    }

    if (!postcode) {
      unresolvedRows.push({
        rowIndex: row.rowIndex,
        receiverName: row.receiverName,
        productHint: row.productHint || '-',
        reason: '우편번호를 찾지 못함',
      })
      continue
    }

    const orderNo = `${prefix}${String(sequence).padStart(4, '0')}`
    sequence += 1
    const rawForcedQty = Number(options.forceQuantity)
    const forcedQty = Number.isFinite(rawForcedQty) && rawForcedQty > 0 ? Math.floor(rawForcedQty) : null
    const finalQty = forcedQty || resolveQuantity(row.sourceType, product.key)
    orders.push({
      '주문번호(*)': orderNo,
      '상품수량(*)': String(finalQty),
      '상품바코드(*)': product.barcode,
      '수취인명(*)': row.receiverName,
      '수취인주소(*)': row.address,
      '수취인 상세 주소': '',
      '수취인 우편번호(*)': postcode,
      '수취인 연락처(*)': row.phone,
      '배송요청사항': '',
      '고객상품아이디': '',
      '비고': '',
      '출고요청 사유': '',
    })
  }

  return { orders, unresolvedRows }
}

export function buildArgoWorkbook(rows: ArgoOrderRow[]) {
  const aoa: string[][] = [
    [...ARGO_HEADERS],
    ...rows.map((row) => ARGO_HEADERS.map((header) => String(row[header] || ''))),
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(aoa)
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 11 },
    { wch: 18 },
    { wch: 12 },
    { wch: 48 },
    { wch: 24 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
  ]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '국내배송 주문')
  return workbook
}

export function downloadArgoWorkbook(rows: ArgoOrderRow[], filename = `아르고_발주_${formatOrderPrefix(new Date())}.xlsx`) {
  const workbook = buildArgoWorkbook(rows)
  XLSX.writeFile(workbook, filename)
}
