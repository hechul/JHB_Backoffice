import * as XLSX from 'xlsx'

export interface ParsedSheet {
    headers: string[]
    rows: Record<string, string>[]
}

export interface ParsedWorkbookSheet extends ParsedSheet {
    name: string
    matrix: string[][]
}

export interface ColumnValidation {
    total: number
    matched: string[]
    missing: string[]
}

export interface ProcessedOrder {
    purchase_id: string
    buyer_id: string
    buyer_name: string
    receiver_name: string
    customer_key: string
    product_id: string
    product_name: string
    option_info: string
    quantity: number
    order_date: string
    order_status: string
    claim_status: string
}

export interface ProcessedExperience {
    mission_product_name: string
    option_info: string
    receiver_name: string
    naver_id: string
    purchase_date: string
    campaign_name: string
}

function computeEffectiveSheetRange(sheet: XLSX.WorkSheet): string | undefined {
    const declaredRef = typeof sheet['!ref'] === 'string' ? sheet['!ref'] : undefined

    let minRow = Number.POSITIVE_INFINITY
    let minCol = Number.POSITIVE_INFINITY
    let maxRow = -1
    let maxCol = -1

    for (const key of Object.keys(sheet)) {
        if (!key || key[0] === '!') continue
        if (!/^[A-Za-z]+[0-9]+$/.test(key)) continue

        let addr: XLSX.CellAddress
        try {
            addr = XLSX.utils.decode_cell(key)
        } catch {
            continue
        }

        if (addr.r < minRow) minRow = addr.r
        if (addr.c < minCol) minCol = addr.c
        if (addr.r > maxRow) maxRow = addr.r
        if (addr.c > maxCol) maxCol = addr.c
    }

    if (maxRow < 0 || maxCol < 0) return declaredRef

    if (declaredRef) {
        try {
            const declared = XLSX.utils.decode_range(declaredRef)
            minRow = Math.max(declared.s.r, minRow)
            minCol = Math.max(declared.s.c, minCol)
            maxRow = Math.min(declared.e.r, maxRow)
            maxCol = Math.min(declared.e.c, maxCol)
        } catch {
            // no-op: fall back to computed range only
        }
    }

    return XLSX.utils.encode_range({
        s: { r: minRow, c: minCol },
        e: { r: maxRow, c: maxCol },
    })
}

function parseWorksheet(sheet: XLSX.WorkSheet | undefined): ParsedSheet {
    if (!sheet) return { headers: [], rows: [] }
    const effectiveRange = computeEffectiveSheetRange(sheet)

    const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        raw: false,
        defval: '',
        ...(effectiveRange ? { range: effectiveRange } : {}),
    })

    if (jsonData.length === 0) {
        return { headers: [], rows: [] }
    }

    const headers = Object.keys(jsonData[0]).map((h) => h.trim())
    const rows = jsonData.map((row) => {
        const cleaned: Record<string, string> = {}
        for (const [key, val] of Object.entries(row)) {
            cleaned[key.trim()] = String(val ?? '').trim()
        }
        return cleaned
    })
    return { headers, rows }
}

function parseWorksheetMatrix(sheet: XLSX.WorkSheet | undefined): string[][] {
    if (!sheet) return []
    const effectiveRange = computeEffectiveSheetRange(sheet)
    const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, {
        header: 1,
        raw: false,
        defval: '',
        ...(effectiveRange ? { range: effectiveRange } : {}),
    })
    return aoa.map((row) => row.map((cell) => String(cell ?? '').trim()))
}

// ── 단일 시트(하위 호환) ──
export async function parseExcelFile(file: File): Promise<ParsedSheet> {
    const sheets = await parseExcelWorkbook(file)
    return sheets[0] || { headers: [], rows: [] }
}

// ── 워크북 전체 시트 파싱 ──
export async function parseExcelWorkbook(file: File): Promise<ParsedWorkbookSheet[]> {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    return workbook.SheetNames.map((name) => {
        const ws = workbook.Sheets[name]
        const parsed = parseWorksheet(ws)
        const matrix = parseWorksheetMatrix(ws)
        return { name, headers: parsed.headers, rows: parsed.rows, matrix }
    })
}

function normalizeSheetName(name: string): string {
    return name.toLowerCase().replace(/[\s_-]/g, '')
}

export function findSheetByPreferredNames(
    sheets: ParsedWorkbookSheet[],
    preferredNames: string[],
    excludedNames: string[] = [],
): ParsedWorkbookSheet | null {
    const excluded = new Set(excludedNames)
    const normalizedTargets = preferredNames.map(normalizeSheetName)
    for (const sheet of sheets) {
        if (excluded.has(sheet.name)) continue
        const normalized = normalizeSheetName(sheet.name)
        if (normalizedTargets.some((target) => normalized === target || normalized.includes(target) || target.includes(normalized))) {
            return sheet
        }
    }
    return null
}

export function detectSheetByColumns(
    sheets: ParsedWorkbookSheet[],
    requiredColumns: string[],
    excludedNames: string[] = [],
): ParsedWorkbookSheet | null {
    const excluded = new Set(excludedNames)
    let best: ParsedWorkbookSheet | null = null
    let bestScore = -1

    for (const sheet of sheets) {
        if (excluded.has(sheet.name)) continue
        const matched = validateColumns(sheet.headers, requiredColumns).matched.length
        if (matched > bestScore) {
            bestScore = matched
            best = sheet
        }
    }

    return bestScore > 0 ? best : null
}

function findHeaderRowIndex(matrix: string[][]): number {
    const headerCandidates = new Set(['미션상품명', '옵션정보', '수취인명', '수취인', '아이디', '구매인증일', '캠페인명', '구매날짜'])
    const maxScan = Math.min(matrix.length, 40)
    for (let i = 0; i < maxScan; i++) {
        const row = matrix[i] || []
        const hitCount = row.filter((cell) => {
            const normalized = normalizeExperienceHeader(cell)
            return !!normalized && headerCandidates.has(normalized)
        }).length
        if (hitCount >= 3) return i
    }
    return -1
}

function normalizeHeaderToken(raw: string): string {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[\s_\-./\\|()[\]{}:]/g, '')
}

export function normalizeExperienceHeader(raw: string): string {
    const cell = normalizeHeaderToken(raw)
    if (!cell) return ''

    if (
        cell.includes('미션상품명')
        || cell.includes('미션상품')
        || cell.includes('미션제품명')
        || cell.includes('미션제품')
        || cell.includes('제품명')
        || cell.includes('품명')
        || cell.includes('품목')
        || cell.includes('상품명')
    ) return '미션상품명'
    if (cell.includes('옵션정보') || cell === '옵션' || cell.includes('옵션명')) return '옵션정보'
    if (cell.includes('수취인명') || cell === '수취인' || cell.includes('수령인')) return '수취인명'
    if (cell.includes('아이디') || cell === 'id' || cell.includes('네이버id') || cell.includes('네이버아이디')) return '아이디'
    if (cell.includes('구매인증일') || cell.includes('구매날짜') || cell.includes('구매일')) return '구매인증일'
    if (cell.includes('캠페인명') || cell.includes('캠페인') || cell.includes('프로젝트명')) return '캠페인명'

    return ''
}

function isIsoDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isLikelyLegacyExperienceRow(cells: string[]): boolean {
    const purchaseDate = (cells[2] || '').trim()
    const missionProductName = (cells[3] || '').trim()
    const receiverName = ((cells[7] || cells[6] || '') + '').trim()
    if (!purchaseDate || !missionProductName) return false
    if (!receiverName) return false
    if (purchaseDate.includes('구매인증일')) return false
    if (purchaseDate.includes('구매날짜')) return false
    if (missionProductName.includes('상품명')) return false
    if (!isIsoDate(normalizeDate(purchaseDate))) return false
    return true
}

export function extractExperienceRows(sheet: ParsedWorkbookSheet): Record<string, string>[] {
    const matrix = sheet.matrix || []
    if (matrix.length === 0) return []

    const headerRowIndex = findHeaderRowIndex(matrix)
    if (headerRowIndex >= 0) {
        const rawHeaders = (matrix[headerRowIndex] || []).map((h) => String(h || '').trim())
        const headers = rawHeaders.map((h) => normalizeExperienceHeader(h) || h)
        const rows: Record<string, string>[] = []
        for (let i = headerRowIndex + 1; i < matrix.length; i++) {
            const row = matrix[i] || []
            if (!row.some((cell) => cell && cell.trim())) continue
            const obj: Record<string, string> = {}
            headers.forEach((header, idx) => {
                if (!header) return
                if (!obj[header]) obj[header] = (row[idx] || '').trim()
            })
            if (obj['수취인'] && !obj['수취인명']) obj['수취인명'] = obj['수취인']
            if (!obj['캠페인명']) obj['캠페인명'] = ''
            rows.push(obj)
        }
        return rows
    }

    // Legacy waveproject format: no header row, fixed index columns.
    const legacyRows: Record<string, string>[] = []
    for (const cells of matrix) {
        if (!isLikelyLegacyExperienceRow(cells)) continue
        const optionCol4 = (cells[4] || '').trim()
        const optionCol5 = (cells[5] || '').trim()
        const optionInfo = optionCol4 || optionCol5
        legacyRows.push({
            미션상품명: (cells[3] || '').trim(),
            옵션정보: optionInfo,
            수취인명: ((cells[7] || cells[6] || '') + '').trim(),
            아이디: (cells[8] || '').trim(),
            구매인증일: (cells[2] || '').trim(),
            캠페인명: '',
        })
    }
    return legacyRows
}

function getExperienceField(row: Record<string, string>, targetHeader: string): string {
    const direct = (row[targetHeader] || '').trim()
    if (direct) return direct

    for (const [key, value] of Object.entries(row)) {
        if (normalizeExperienceHeader(key) === targetHeader) {
            const v = String(value || '').trim()
            if (v) return v
        }
    }
    return ''
}

// ── 컬럼 검증 ──
export function validateColumns(
    headers: string[],
    requiredColumns: string[],
): ColumnValidation {
    const headerSet = new Set(headers)
    const matched: string[] = []
    const missing: string[] = []

    for (const col of requiredColumns) {
        if (headerSet.has(col)) {
            matched.push(col)
        } else {
            missing.push(col)
        }
    }

    return { total: requiredColumns.length, matched, missing }
}

// ── 날짜 정규화 ──
function normalizeDate(value: string): string {
    if (!value) return ''
    const raw = String(value).trim()
    const compact = raw.replace(/\s+/g, '')

    // YYYY-MM-DD 이미 포맷 되어 있으면
    if (/^\d{4}-\d{2}-\d{2}$/.test(compact)) return compact

    // YYYY-MM-DD HH:mm:ss 형태
    const match1 = compact.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (match1) return `${match1[1]}-${match1[2].padStart(2, '0')}-${match1[3].padStart(2, '0')}`

    // YYYY.MM.DD 또는 YYYY/MM/DD
    const match2 = compact.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/)
    if (match2) return `${match2[1]}-${match2[2].padStart(2, '0')}-${match2[3].padStart(2, '0')}`

    // Date 객체 시도
    const d = new Date(raw)
    if (!isNaN(d.getTime())) {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
    }

    return raw
}

// ── 유효 주문 상태 필터 ──
const EXCLUDED_ORDER_STATUSES = [
    '취소완료', '반품완료', '환불완료', '주문취소',
    '취소', '반품', '환불',
]
const EXCLUDED_CLAIM_STATUSES = [
    '취소완료', '반품완료', '환불완료',
    '취소', '반품', '환불',
]

function isValidOrder(orderStatus: string, claimStatus: string): boolean {
    // 반품철회/취소철회 등 철회 상태는 유효 주문으로 본다.
    if (orderStatus.includes('철회') || claimStatus.includes('철회')) return true
    if (EXCLUDED_ORDER_STATUSES.some((s) => orderStatus.includes(s))) return false
    if (claimStatus && EXCLUDED_CLAIM_STATUSES.some((s) => claimStatus.includes(s))) return false
    return true
}

// ── 주문 전처리 ──
export function preprocessOrders(
    rows: Record<string, string>[],
): { valid: ProcessedOrder[]; excluded: number } {
    const valid: ProcessedOrder[] = []
    let excluded = 0

    for (const row of rows) {
        const orderStatus = row['주문상태'] || ''
        const claimStatus = row['클레임상태'] || ''
        const purchaseId = (row['상품주문번호'] || '').trim()

        if (!isValidOrder(orderStatus, claimStatus)) {
            excluded++
            continue
        }
        if (!purchaseId) {
            excluded++
            continue
        }

        const buyerId = row['구매자ID'] || ''
        const buyerName = row['구매자명'] || ''

        valid.push({
            purchase_id: purchaseId,
            buyer_id: buyerId,
            buyer_name: buyerName,
            receiver_name: row['수취인명'] || '',
            customer_key: `${buyerId}_${buyerName}`,
            product_id: row['상품번호'] || '',
            product_name: row['상품명'] || '',
            option_info: row['옵션정보'] || '',
            quantity: parseInt(row['수량'] || '1', 10) || 1,
            order_date: normalizeDate(row['주문일시'] || ''),
            order_status: orderStatus,
            claim_status: claimStatus,
        })
    }

    return { valid, excluded }
}

// ── 체험단 전처리 ──
export function preprocessExperiences(
    rows: Record<string, string>[],
): ProcessedExperience[] {
    const processed: ProcessedExperience[] = []
    for (const row of rows) {
        const missionProductName = getExperienceField(row, '미션상품명')
        const receiverName = getExperienceField(row, '수취인명')
        const naverId = getExperienceField(row, '아이디')
        const purchaseDate = normalizeDate(getExperienceField(row, '구매인증일'))
        const optionInfo = getExperienceField(row, '옵션정보')
        const campaignName = getExperienceField(row, '캠페인명')

        // 헤더 행/잘못된 날짜 문자열 유입 방지
        // 운영 요청 반영: 아이디 공백 행도 적재 허용
        if (!missionProductName || !isIsoDate(purchaseDate)) continue

        processed.push({
            mission_product_name: missionProductName,
            option_info: optionInfo,
            receiver_name: receiverName,
            naver_id: naverId,
            purchase_date: purchaseDate,
            campaign_name: campaignName,
        })
    }
    return processed
}
