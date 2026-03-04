const XLSX = require('xlsx')

const filePath = '/Users/huicheol/Desktop/스마트스토어/2월 네이버 스스 매출.xlsx'

function computeEffectiveSheetRange(sheet) {
  const declaredRef = typeof sheet['!ref'] === 'string' ? sheet['!ref'] : undefined
  let minRow = Number.POSITIVE_INFINITY
  let minCol = Number.POSITIVE_INFINITY
  let maxRow = -1
  let maxCol = -1
  for (const key of Object.keys(sheet)) {
    if (!key || key[0] === '!') continue
    if (!/^[A-Za-z]+[0-9]+$/.test(key)) continue
    let addr
    try { addr = XLSX.utils.decode_cell(key) } catch { continue }
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
    } catch {}
  }
  return XLSX.utils.encode_range({ s: { r: minRow, c: minCol }, e: { r: maxRow, c: maxCol } })
}

function parseWorksheet(sheet) {
  const range = computeEffectiveSheetRange(sheet)
  const rows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '', ...(range ? { range } : {}) })
  const headers = rows.length > 0 ? Object.keys(rows[0]).map((h) => String(h).trim()) : []
  const cleaned = rows.map((row) => {
    const out = {}
    for (const [k, v] of Object.entries(row)) out[String(k).trim()] = String(v ?? '').trim()
    return out
  })
  return { headers, rows: cleaned }
}

function parseWorksheetMatrix(sheet) {
  const range = computeEffectiveSheetRange(sheet)
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', ...(range ? { range } : {}) })
  return aoa.map((row) => row.map((cell) => String(cell ?? '').trim()))
}

function normalizeHeaderToken(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[\s_\-./\\|()[\]{}:]/g, '')
}

function normalizeExperienceHeader(raw) {
  const cell = normalizeHeaderToken(raw)
  if (!cell) return ''
  if (cell.includes('미션상품명') || cell.includes('미션상품') || cell.includes('미션제품명') || cell.includes('미션제품') || cell.includes('제품명') || cell.includes('품명') || cell.includes('품목') || cell.includes('상품명')) return '미션상품명'
  if (cell.includes('옵션정보') || cell === '옵션' || cell.includes('옵션명')) return '옵션정보'
  if (cell.includes('수취인명') || cell === '수취인' || cell.includes('수령인')) return '수취인명'
  if (cell.includes('아이디') || cell === 'id' || cell.includes('네이버id') || cell.includes('네이버아이디')) return '아이디'
  if (cell.includes('구매인증일') || cell.includes('구매날짜') || cell.includes('구매일')) return '구매인증일'
  if (cell.includes('캠페인명') || cell.includes('캠페인') || cell.includes('프로젝트명')) return '캠페인명'
  return ''
}

function findHeaderRowIndex(matrix) {
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

function normalizeDate(value) {
  if (!value) return ''
  const raw = String(value).trim()
  const compact = raw.replace(/\s+/g, '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(compact)) return compact
  const match1 = compact.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match1) return `${match1[1]}-${match1[2].padStart(2, '0')}-${match1[3].padStart(2, '0')}`
  const match2 = compact.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/)
  if (match2) return `${match2[1]}-${match2[2].padStart(2, '0')}-${match2[3].padStart(2, '0')}`
  const d = new Date(raw)
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0')
    return `${y}-${m}-${day}`
  }
  return raw
}

function isIsoDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) }

function extractExperienceRows(matrix) {
  const headerRowIndex = findHeaderRowIndex(matrix)
  if (headerRowIndex < 0) return []
  const rawHeaders = (matrix[headerRowIndex] || []).map((h) => String(h || '').trim())
  const headers = rawHeaders.map((h) => normalizeExperienceHeader(h) || h)
  const rows = []
  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] || []
    if (!row.some((cell) => cell && String(cell).trim())) continue
    const obj = {}
    headers.forEach((header, idx) => {
      if (!header) return
      if (!obj[header]) obj[header] = String(row[idx] || '').trim()
    })
    if (obj['수취인'] && !obj['수취인명']) obj['수취인명'] = obj['수취인']
    if (!obj['캠페인명']) obj['캠페인명'] = ''
    rows.push(obj)
  }
  return rows
}

const EXCLUDED_ORDER_STATUSES = ['취소완료', '반품완료', '환불완료', '주문취소', '취소', '반품', '환불']
const EXCLUDED_CLAIM_STATUSES = ['취소완료', '반품완료', '환불완료', '취소', '반품', '환불']

function isValidOrder(orderStatus, claimStatus) {
  if ((orderStatus || '').includes('철회') || (claimStatus || '').includes('철회')) return true
  if (EXCLUDED_ORDER_STATUSES.some((s) => (orderStatus || '').includes(s))) return false
  if (claimStatus && EXCLUDED_CLAIM_STATUSES.some((s) => claimStatus.includes(s))) return false
  return true
}

function preprocessOrders(rows) {
  const valid = []
  let excluded = 0
  for (const row of rows) {
    const orderStatus = row['주문상태'] || ''
    const claimStatus = row['클레임상태'] || ''
    const purchaseId = (row['상품주문번호'] || '').trim()
    if (!isValidOrder(orderStatus, claimStatus)) { excluded++; continue }
    if (!purchaseId) { excluded++; continue }
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
      is_manual: false,
      matched_exp_id: null,
    })
  }
  return { valid, excluded }
}

function getExperienceField(row, targetHeader) {
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

function preprocessExperiences(rows) {
  const processed = []
  for (const row of rows) {
    const missionProductName = getExperienceField(row, '미션상품명')
    const receiverName = getExperienceField(row, '수취인명')
    const naverId = getExperienceField(row, '아이디')
    const purchaseDate = normalizeDate(getExperienceField(row, '구매인증일'))
    const optionInfo = getExperienceField(row, '옵션정보')
    if (!missionProductName || !isIsoDate(purchaseDate)) continue
    processed.push({
      id: processed.length + 1,
      mission_product_name: missionProductName,
      mapped_product_id: 'MAPPED',
      option_info: optionInfo,
      receiver_name: receiverName,
      naver_id: naverId,
      purchase_date: purchaseDate,
    })
  }
  return processed
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/[^0-9a-z가-힣]/g, '')
}

function idPrefix(value) { return normalizeText(value).slice(0,4) }
function toDate(value) { const d = new Date(`${value}T00:00:00`); return Number.isNaN(d.getTime()) ? null : d }
function diffDays(a,b) { const da=toDate(a), db=toDate(b); if(!da||!db) return Number.POSITIVE_INFINITY; return Math.floor(Math.abs(da-db)/(1000*60*60*24)) }

const PRODUCT_KEYWORDS = ['애착트릿','츄라잇','케어푸','두부모래','이즈바이트','엔자이츄','트릿백','츄르짜개','샘플팩','맛보기']
function extractProductKeyword(rawName) {
  const name = normalizeText(rawName)
  if (!name) return null
  const hasFreezeDried = name.includes('동결건조') || name.includes('동견건조')
  const hasAttachmentTreat = name.includes('애착트릿')
  if (hasFreezeDried && !hasAttachmentTreat) return '동결건조리뉴얼전'
  for (const kw of PRODUCT_KEYWORDS) if (name.includes(kw)) return kw
  return null
}

const OPTION_RULES = [
  { product: '애착트릿', source: 'product_name', keywords: ['북어','연어','치킨','3종세트'] },
  { product: '츄라잇', source: 'option_info', keywords: ['데일리핏','클린펫','브라이트'] },
]

function normalizeOptionAlias(productKeyword, normalizedSource) {
  if (productKeyword !== '애착트릿') return null
  if (normalizedSource.includes('닭가슴살') || normalizedSource.includes('닭고기')) return '치킨'
  return null
}

function extractPurchaseOptionKeyword(productKeyword, productName, optionInfo) {
  const rule = OPTION_RULES.find((r) => r.product === productKeyword)
  if (!rule) return null
  const source = rule.source === 'product_name' ? normalizeText(productName) : normalizeText(optionInfo)
  for (const kw of rule.keywords) if (source.includes(kw)) return kw
  const alias1 = normalizeOptionAlias(productKeyword, source)
  if (alias1) return alias1
  if (rule.source === 'product_name') {
    const optionSource = normalizeText(optionInfo)
    for (const kw of rule.keywords) if (optionSource.includes(kw)) return kw
    const alias2 = normalizeOptionAlias(productKeyword, optionSource)
    if (alias2) return alias2
  }
  return null
}

function extractExperienceOptionKeyword(productKeyword, optionInfo) {
  const rule = OPTION_RULES.find((r) => r.product === productKeyword)
  if (!rule) return null
  const normalized = normalizeText(optionInfo)
  for (const kw of rule.keywords) if (normalized.includes(kw)) return kw
  const alias = normalizeOptionAlias(productKeyword, normalized)
  if (alias) return alias
  return null
}

function idsMatch(p,e){ const l=idPrefix(p.buyer_id), r=idPrefix(e.naver_id); return !!l && !!r && l===r }
function namesMatch(p,e){ const t=normalizeText(e.receiver_name); if(!t) return false; const b=normalizeText(p.buyer_name), r=normalizeText(p.receiver_name||''); return t===b || t===r }
function productMatches(p,e){ const pk=extractProductKeyword(p.product_name), ek=extractProductKeyword(e.mission_product_name); if(pk&&ek) return pk===ek; const pn=normalizeText(p.product_name), en=normalizeText(e.mission_product_name); if(!pn||!en) return false; return pn===en||pn.includes(en)||en.includes(pn) }
function optionsMatch(p,e){ const kw=extractProductKeyword(p.product_name); if(!kw){const po=normalizeText(p.option_info||''), eo=normalizeText(e.option_info||''); if(!po&&!eo) return true; if(!po||!eo) return true; return po===eo||po.includes(eo)||eo.includes(po)} const rule=OPTION_RULES.find((r)=>r.product===kw); if(!rule) return true; const pkw=extractPurchaseOptionKeyword(kw,p.product_name,p.option_info||''), ekw=extractExperienceOptionKeyword(kw,e.option_info||''); if(!pkw&&!ekw) return true; if(!pkw||!ekw) return false; return pkw===ekw }
function isInDateRange(p,e,t){ return diffDays(p.order_date,e.purchase_date) <= t }

function computeUnmatchReason(exp, purchases){
  if (!exp.mapped_product_id) return '상품매핑_실패'
  const expKw = extractProductKeyword(exp.mission_product_name)
  if (!expKw) {
    const eName = normalizeText(exp.mission_product_name)
    if (!eName) return '상품명_없음'
    const hasAny = purchases.some((p)=>{ const pName=normalizeText(p.product_name); return pName===eName||pName.includes(eName)||eName.includes(pName) })
    if (!hasAny) return '상품매핑_실패'
  }
  const hasDateCandidate = purchases.some((p)=> productMatches(p,exp) && isInDateRange(p,exp,1))
  if (!hasDateCandidate) return '기간외_주문없음'
  return '조건_불일치'
}

function deduplicateExperiences(experiences){
  const groups = new Map()
  for (const exp of experiences){
    const naverId = normalizeText(exp.naver_id)
    const receiver = normalizeText(exp.receiver_name)
    const productKey = extractProductKeyword(exp.mission_product_name) || normalizeText(exp.mission_product_name) || `__product_${exp.id}`
    const purchaseDate = String(exp.purchase_date || '')
    const optionKey = normalizeText(exp.option_info || '')
    const identity = naverId || (receiver ? `receiver_${receiver}` : `id_${exp.id}`)
    const gk = `${identity}::${productKey}::${purchaseDate}::${optionKey}`
    const existing = groups.get(gk)
    if (!existing || (exp.mission_product_name||'').length > (existing.mission_product_name||'').length) groups.set(gk, exp)
  }
  return [...groups.values()]
}

function buildMatchingResult(purchases, experiences){
  const matchedExpIds = new Set()
  const matchedPurchaseIds = new Set()
  const matches = []
  const rankCounts = {1:0,2:0,3:0,4:0,5:0}
  const candidateExperiences = deduplicateExperiences(experiences)
  const NON_CAMPAIGN = new Set(['트릿백','츄르짜개','샘플팩','맛보기','동결건조리뉴얼전'])
  const candidatePurchases = purchases.filter((p)=>{const kw=extractProductKeyword(p.product_name); return !(kw && NON_CAMPAIGN.has(kw))})

  const rankRules = [
    {rank:1, reason:'완벽일치_매칭', matches:(p,e)=> idsMatch(p,e)&&namesMatch(p,e)&&productMatches(p,e)&&optionsMatch(p,e)&&diffDays(p.order_date,e.purchase_date)===0},
    {rank:2, reason:'날짜오차_매칭', matches:(p,e)=> idsMatch(p,e)&&namesMatch(p,e)&&productMatches(p,e)&&optionsMatch(p,e)&&isInDateRange(p,e,1)},
    {rank:3, reason:'옵션불일치_매칭', matches:(p,e)=> idsMatch(p,e)&&namesMatch(p,e)&&productMatches(p,e)&&isInDateRange(p,e,1)&&!optionsMatch(p,e)},
    {rank:4, reason:'ID불일치_매칭', matches:(p,e)=> namesMatch(p,e)&&productMatches(p,e)&&optionsMatch(p,e)&&isInDateRange(p,e,1)&&!idsMatch(p,e)},
    {rank:5, reason:'이름불일치_매칭', matches:(p,e)=> idsMatch(p,e)&&productMatches(p,e)&&optionsMatch(p,e)&&isInDateRange(p,e,1)&&!namesMatch(p,e)},
  ]

  for (const rule of rankRules){
    for (const p of candidatePurchases){
      if (matchedPurchaseIds.has(p.purchase_id)) continue
      const candidate = candidateExperiences.find((e)=> !matchedExpIds.has(e.id) && rule.matches(p,e))
      if (!candidate) continue
      matchedPurchaseIds.add(p.purchase_id)
      matchedExpIds.add(candidate.id)
      rankCounts[rule.rank]++
      matches.push({purchaseId:p.purchase_id, expId:candidate.id, rank:rule.rank, reason:rule.reason})
    }
  }

  const reasons = new Map()
  for (const exp of experiences){
    if (matchedExpIds.has(exp.id)) continue
    reasons.set(exp.id, computeUnmatchReason(exp, purchases))
  }

  return {matches, unmatchedReasons: reasons, rankCounts, dedupedExpCount: candidateExperiences.length, candidatePurchases: candidatePurchases.length}
}

const wb = XLSX.readFile(filePath, { cellDates: false })
const orderSheet = wb.Sheets['주문조회'] || wb.Sheets[wb.SheetNames[0]]
const expSheet = wb.Sheets['Sheet1'] || wb.Sheets[wb.SheetNames[1]]

const ordersParsed = parseWorksheet(orderSheet)
const expMatrix = parseWorksheetMatrix(expSheet)
const expRowsRaw = extractExperienceRows(expMatrix)

const { valid: orders, excluded } = preprocessOrders(ordersParsed.rows)
const experiences = preprocessExperiences(expRowsRaw)

const matching = buildMatchingResult(orders, experiences)
const reasonCounts = {}
for (const reason of matching.unmatchedReasons.values()) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1

console.log('sheetNames=', wb.SheetNames)
console.log('orderRows(raw)=', ordersParsed.rows.length, 'orderValid=', orders.length, 'orderExcluded=', excluded)
console.log('expRows(rawExtracted)=', expRowsRaw.length, 'expPreprocessed=', experiences.length, 'expDeduped=', matching.dedupedExpCount)
console.log('candidatePurchases=', matching.candidatePurchases)
console.log('matched=', matching.matches.length, 'unmatched=', matching.unmatchedReasons.size)
console.log('rankCounts=', matching.rankCounts)
console.log('unmatchedReasonCounts=', reasonCounts)

const topReasons = Object.entries(reasonCounts).sort((a,b)=>b[1]-a[1])
if (topReasons.length) {
  const major = topReasons[0][0]
  const samples = experiences
    .filter((e) => !matching.matches.some((m) => m.expId === e.id))
    .filter((e) => computeUnmatchReason(e, orders) === major)
    .slice(0, 12)
    .map((e) => ({ date:e.purchase_date, receiver:e.receiver_name, id:e.naver_id, product:e.mission_product_name, option:e.option_info }))
  console.log('majorReason=', major, 'count=', topReasons[0][1])
  console.log('majorSamples=', samples)
}
