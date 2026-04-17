import { existsSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
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
  type FilterPurchaseRow,
  type FilterExperienceRow,
} from '../../app/composables/useFilterMatching'

const FILE_PATH = '/Users/huicheol/Desktop/스마트스토어/202601 네이버스스 주문건+구매평 작업건.xlsx'
const HAS_FILE = existsSync(FILE_PATH)

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

describe('real workbook accuracy check', () => {
  it.skipIf(!HAS_FILE)('validates matching quality against the current integrated workbook', async () => {
    const buffer = readFileSync(FILE_PATH)
    const file = new File([buffer], 'workbook.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const sheets = await parseExcelWorkbook(file)
    const orderSheet = pickOrderSheet(sheets)
    const expSheet = pickExperienceSheet(sheets, orderSheet ? [orderSheet.name] : [])

    expect(orderSheet).toBeTruthy()
    expect(expSheet).toBeTruthy()

    const orderRows = orderSheet ? orderSheet.rows : []
    const expRows = expSheet ? extractExperienceRows(expSheet) : []

    const { valid: validOrders } = preprocessOrders(orderRows)
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

    const result = buildMatchingResult(purchases, experiences)

    const kimOrders = result.matches.filter((m) =>
      m.purchaseId === '2026011942914101' || m.purchaseId === '2026011759370831',
    )

    console.log(JSON.stringify({
      orderSheetName: orderSheet?.name,
      expSheetName: expSheet?.name,
      validOrders: validOrders.length,
      validExperiences: validExperiences.length,
      matched: result.matches.length,
      unmatched: result.unmatchedReasons.size,
      reviewQueue: result.reviewPurchaseIds.length,
      ambiguousCount: result.ambiguousCount,
      rankCounts: result.rankCounts,
      kimOrders,
    }, null, 2))

    expect(validExperiences.length).toBe(340)
    expect(result.unmatchedReasons.size).toBe(0)
    expect(result.reviewPurchaseIds.length).toBe(0)
    expect(kimOrders).toHaveLength(2)
  })
})

