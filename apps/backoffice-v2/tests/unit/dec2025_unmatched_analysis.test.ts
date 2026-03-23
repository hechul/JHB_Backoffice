import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import {
  parseExcelWorkbook,
  findSheetByPreferredNames,
  detectSheetByColumns,
  preprocessOrders,
  preprocessExperiences,
  extractExperienceRows,
} from '../../app/composables/useExcelParser'
import {
  buildMatchingResult,
  deduplicateExperiences,
  computeUnmatchReason,
  type FilterPurchaseRow,
  type FilterExperienceRow,
} from '../../app/composables/useFilterMatching'

const FILE_PATH = '/Users/huicheol/Desktop/스마트스토어/202512 네이버스스 판매 조회 (구매평 제외).xlsx'

const ORDER_REQUIRED_COLUMNS = ['상품주문번호', '상품명', '상품번호', '옵션정보', '수량', '구매자명', '구매자ID', '수취인명', '주문일시', '주문상태', '클레임상태']
const EXP_REQUIRED_COLUMNS = ['미션상품명', '옵션정보', '수취인명', '아이디', '구매인증일', '캠페인명']
const ORDER_SHEET_ALIASES = ['네이버 스스', '네이버스스', '스마트스토어', '네이버 스마트스토어']
const EXP_SHEET_ALIASES = ['웨이프로젝트', '웨이 프로젝트', '체험단']

function pickOrderSheet(sheets: any[]) {
  return findSheetByPreferredNames(sheets, ORDER_SHEET_ALIASES)
    || detectSheetByColumns(sheets, ORDER_REQUIRED_COLUMNS)
}

function pickExperienceSheet(sheets: any[], excludedNames: string[]) {
  return findSheetByPreferredNames(sheets, EXP_SHEET_ALIASES, excludedNames)
    || detectSheetByColumns(sheets, EXP_REQUIRED_COLUMNS, excludedNames)
}

describe('dec-2025 unmatched analysis', () => {
  it('prints unmatched reason distribution', async () => {
    if (!existsSync(FILE_PATH)) {
      console.log(JSON.stringify({ error: 'file not found', file: FILE_PATH }, null, 2))
      return
    }

    const buffer = readFileSync(FILE_PATH)
    const file = new File([buffer], 'workbook.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const sheets = await parseExcelWorkbook(file)
    const orderSheet = pickOrderSheet(sheets)
    const expSheet = pickExperienceSheet(sheets, orderSheet ? [orderSheet.name] : [])

    const orderRows = orderSheet ? orderSheet.rows : []
    const expRows = expSheet ? extractExperienceRows(expSheet) : []

    const { valid: validOrders, excluded } = preprocessOrders(orderRows)
    const validExperiences = preprocessExperiences(expRows)

    const purchases: FilterPurchaseRow[] = validOrders.map((row) => ({
      purchase_id: row.purchase_id,
      buyer_id: row.buyer_id,
      buyer_name: row.buyer_name,
      receiver_name: row.receiver_name,
      product_id: row.product_id,
      product_name: row.product_name,
      option_info: row.option_info,
      quantity: row.quantity,
      order_date: row.order_date,
      is_manual: false,
      matched_exp_id: null,
    }))

    const experiences: FilterExperienceRow[] = validExperiences.map((row, idx) => ({
      id: idx + 1,
      mission_product_name: row.mission_product_name,
      mapped_product_id: row.mission_product_name ? 'mapped' : null,
      option_info: row.option_info,
      receiver_name: row.receiver_name,
      naver_id: row.naver_id,
      purchase_date: row.purchase_date,
    }))

    const dedupedExperiences = deduplicateExperiences(experiences)
    const result = buildMatchingResult(purchases, experiences)

    const matchedExpIds = new Set(result.matches.map((m) => m.expId))
    const unmatchedExperiences = dedupedExperiences.filter((exp) => !matchedExpIds.has(exp.id))

    const reasonCount = new Map<string, number>()
    const sampleByReason = new Map<string, any[]>()

    for (const exp of unmatchedExperiences) {
      const reason = computeUnmatchReason(exp, purchases)
      reasonCount.set(reason, (reasonCount.get(reason) || 0) + 1)
      const arr = sampleByReason.get(reason) || []
      if (arr.length < 5) {
        arr.push({
          id: exp.id,
          receiver: exp.receiver_name,
          naver_id: exp.naver_id,
          purchase_date: exp.purchase_date,
          mission_product_name: exp.mission_product_name,
          option_info: exp.option_info,
        })
      }
      sampleByReason.set(reason, arr)
    }

    const reasonDist = Array.from(reasonCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count, samples: sampleByReason.get(reason) || [] }))

    console.log(JSON.stringify({
      orderSheetName: orderSheet?.name,
      expSheetName: expSheet?.name,
      validOrders: validOrders.length,
      excludedOrders: excluded,
      validExperiences: validExperiences.length,
      dedupedExperiences: dedupedExperiences.length,
      matched: result.matches.length,
      unmatched: result.unmatchedReasons.size,
      unmatchedByPostCompute: unmatchedExperiences.length,
      reviewQueue: result.reviewPurchaseIds.length,
      rankCounts: result.rankCounts,
      reasonDist,
    }, null, 2))
  })
})
