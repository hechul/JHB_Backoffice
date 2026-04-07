import crypto from 'node:crypto'

import {
  computeNaverSearchAdRoas,
  formatNaverSearchAdCompetition,
  normalizeNaverSearchAdPreset,
  parseNaverSearchAdMonthlyValue,
  type NaverSearchAdAdgroupRow,
  type NaverSearchAdCampaignRow,
  type NaverSearchAdDailyPoint,
  type NaverSearchAdKeywordRow,
  type NaverSearchAdMonthlyPoint,
  type NaverSearchAdOverviewResponse,
  type NaverSearchAdPreset,
  type NaverSearchAdRelatedKeywordRow,
} from '../../../shared/naverSearchAd'

const NAVER_SEARCHAD_BASE_URL = 'https://api.searchad.naver.com'
const NAVER_SEARCHAD_TIMEOUT_MS = 15_000
const NAVER_SEARCHAD_BATCH_SIZE = 80
const NAVER_SEARCHAD_TOP_ADGROUP_LIMIT = 12
const NAVER_SEARCHAD_TOP_KEYWORD_LIMIT = 12
const NAVER_SEARCHAD_RELATED_KEYWORD_LIMIT = 12
const NAVER_SEARCHAD_CACHE_TTL_MS = 5 * 60 * 1000
const NAVER_SEARCHAD_REQUEST_INTERVAL_MS = 220
const NAVER_SEARCHAD_MAX_RETRIES = 3
const NAVER_SEARCHAD_MONTHLY_RANGE_COUNT = 12

const STAT_FIELDS = [
  'impCnt',
  'clkCnt',
  'salesAmt',
  'ctr',
  'cpc',
  'ccnt',
  'purchaseCcnt',
  'purchaseConvAmt',
] as const

interface SearchAdCampaignEntity {
  nccCampaignId: string
  name: string
  status?: string | null
  dailyBudget?: number | null
}

interface SearchAdAdgroupEntity {
  nccAdgroupId: string
  nccCampaignId: string
  name: string
  status?: string | null
  bidAmt?: number | null
}

interface SearchAdKeywordEntity {
  nccKeywordId: string
  keyword: string
  nccCampaignId: string
  nccAdgroupId: string
  bidAmt?: number | null
  nccQi?: {
    qiGrade?: number | null
  } | null
  adRelevanceScore?: number | null
  expectedClickScore?: number | null
}

interface SearchAdStatRow {
  id: string
  impCnt?: number
  clkCnt?: number
  salesAmt?: number
  ctr?: number
  cpc?: number
  ccnt?: number
  purchaseCcnt?: number
  purchaseConvAmt?: number
}

interface SearchAdDailyRow {
  dateStart: string
  dateEnd: string
  impCnt?: number
  clkCnt?: number
  salesAmt?: number
  ctr?: number
  cpc?: number
  ccnt?: number
  purchaseCcnt?: number
  purchaseConvAmt?: number
}

interface CachedOverviewEntry {
  expiresAt: number
  value: NaverSearchAdOverviewResponse
}

interface CachedTrendEntry {
  expiresAt: number
  value: NaverSearchAdDailyPoint[]
}

const overviewCache = new Map<string, CachedOverviewEntry>()
const trendCache = new Map<string, CachedTrendEntry>()
let queuedRequest = Promise.resolve()

function requireSearchAdEnv(name: string): string {
  const value = String(process.env[name] || '').trim()
  if (!value) {
    throw createError({
      statusCode: 500,
      message: `${name} 환경변수가 설정되지 않았습니다.`,
    })
  }

  return value
}

function getSearchAdConfig() {
  return {
    baseUrl: String(process.env.NAVER_SEARCHAD_API_BASE_URL || NAVER_SEARCHAD_BASE_URL).trim() || NAVER_SEARCHAD_BASE_URL,
    customerId: requireSearchAdEnv('NAVER_SEARCHAD_CUSTOMER_ID'),
    accessLicense: requireSearchAdEnv('NAVER_SEARCHAD_ACCESS_LICENSE'),
    secretKey: requireSearchAdEnv('NAVER_SEARCHAD_SECRET_KEY'),
  }
}

function toInteger(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : 0
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function buildTimeRangeLabel(preset: NaverSearchAdPreset, todayKst: string): string {
  if (preset === 'last7days') return '최근 7일'
  if (preset === 'last30days') return '최근 30일'
  return `${todayKst.slice(0, 7).replace('-', '.')} 기준`
}

function formatKstDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value || '1970'
  const month = parts.find((part) => part.type === 'month')?.value || '01'
  const day = parts.find((part) => part.type === 'day')?.value || '01'
  return `${year}-${month}-${day}`
}

function formatKstMonth(date: Date): string {
  return formatKstDate(date).slice(0, 7)
}

function shiftMonthToken(monthToken: string, offset: number): string {
  const [year, month] = monthToken.split('-').map((part) => Number(part))
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthToken
  const date = new Date(Date.UTC(year, month - 1, 1))
  date.setUTCMonth(date.getUTCMonth() + offset)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function endOfMonthToken(monthToken: string): string {
  const [year, month] = monthToken.split('-').map((part) => Number(part))
  if (!Number.isFinite(year) || !Number.isFinite(month)) return `${monthToken}-31`
  return formatKstDate(new Date(Date.UTC(year, month, 0)))
}

function isMonthToken(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value)
}

function hasMonthlyActivity(row: NaverSearchAdMonthlyPoint): boolean {
  return row.spend > 0
    || row.impressions > 0
    || row.clicks > 0
    || row.conversions > 0
    || row.purchaseConversions > 0
    || row.purchaseConversionValue > 0
}

function trimMonthlyRows(rows: NaverSearchAdMonthlyPoint[]): NaverSearchAdMonthlyPoint[] {
  const firstActiveIndex = rows.findIndex(hasMonthlyActivity)
  if (firstActiveIndex < 0) return rows
  return rows.slice(firstActiveIndex)
}

export function normalizeNaverSearchAdMonthToken(value: unknown): string | null {
  const token = String(value || '').trim()
  return isMonthToken(token) ? token : null
}

function buildMonthTimeRange(monthToken: string, now = new Date()) {
  const todayKst = formatKstDate(now)
  const currentMonth = formatKstMonth(now)
  return {
    since: `${monthToken}-01`,
    until: monthToken === currentMonth ? todayKst : endOfMonthToken(monthToken),
  }
}

export function buildNaverSearchAdTimeRange(presetInput: unknown, now = new Date()) {
  const preset = normalizeNaverSearchAdPreset(presetInput)
  const today = new Date(now)
  const todayKst = formatKstDate(today)

  const sinceDate = new Date(today)
  if (preset === 'last7days') {
    sinceDate.setDate(sinceDate.getDate() - 6)
  } else if (preset === 'last30days') {
    sinceDate.setDate(sinceDate.getDate() - 29)
  } else {
    const [year, month] = todayKst.split('-')
    sinceDate.setFullYear(Number(year), Number(month) - 1, 1)
  }

  return {
    preset,
    label: buildTimeRangeLabel(preset, todayKst),
    timeRange: {
      since: formatKstDate(sinceDate),
      until: todayKst,
    },
  }
}

export function buildNaverSearchAdMonthlyRanges(now = new Date(), count = NAVER_SEARCHAD_MONTHLY_RANGE_COUNT) {
  const todayKst = formatKstDate(now)
  const currentMonth = formatKstMonth(now)
  const ranges: Array<{ month: string; timeRange: { since: string; until: string } }> = []

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const month = shiftMonthToken(currentMonth, -offset)
    ranges.push({
      month,
      timeRange: {
        since: `${month}-01`,
        until: month === currentMonth ? todayKst : endOfMonthToken(month),
      },
    })
  }

  return ranges
}

function buildSignature(timestamp: string, method: string, uri: string, secretKey: string): string {
  const message = `${timestamp}.${method}.${uri}`
  return crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('base64')
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForSearchAdSlot() {
  const previous = queuedRequest
  let release: (() => void) | null = null

  queuedRequest = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous
  await wait(NAVER_SEARCHAD_REQUEST_INTERVAL_MS)
  release?.()
}

async function requestSearchAd<T>(method: 'GET', uri: string, params?: Record<string, string | number | undefined>) {
  const config = getSearchAdConfig()
  for (let attempt = 0; attempt < NAVER_SEARCHAD_MAX_RETRIES; attempt += 1) {
    const timestamp = Date.now().toString()
    const url = new URL(config.baseUrl + uri)

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '') continue
        url.searchParams.set(key, String(value))
      }
    }

    await waitForSearchAdSlot()

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), NAVER_SEARCHAD_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Timestamp': timestamp,
          'X-API-KEY': config.accessLicense,
          'X-Customer': config.customerId,
          'X-Signature': buildSignature(timestamp, method, uri, config.secretKey),
        },
        signal: controller.signal,
      })

      const text = await response.text()
      let body: any = null

      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = text
      }

      if (!response.ok) {
        if (response.status === 429 && attempt < NAVER_SEARCHAD_MAX_RETRIES - 1) {
          await wait(600 * (attempt + 1))
          continue
        }

        throw createError({
          statusCode: 502,
          message: `네이버 검색광고 API 요청에 실패했습니다. (${response.status})`,
          data: body,
        })
      }

      return body as T
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw createError({
          statusCode: 504,
          message: '네이버 검색광고 API 응답 시간이 초과되었습니다.',
        })
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  throw createError({
    statusCode: 502,
    message: '네이버 검색광고 API 요청에 반복 실패했습니다.',
  })
}

async function runWithConcurrency<TInput, TOutput>(
  items: TInput[],
  worker: (item: TInput) => Promise<TOutput>,
  concurrency = 4,
): Promise<TOutput[]> {
  const results: TOutput[] = []
  let currentIndex = 0

  async function consume() {
    while (currentIndex < items.length) {
      const index = currentIndex
      currentIndex += 1
      results[index] = await worker(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => consume()))
  return results
}

function chunkIds(ids: string[], chunkSize = NAVER_SEARCHAD_BATCH_SIZE) {
  const chunks: string[][] = []
  for (let index = 0; index < ids.length; index += chunkSize) {
    chunks.push(ids.slice(index, index + chunkSize))
  }
  return chunks
}

async function listCampaigns(): Promise<SearchAdCampaignEntity[]> {
  const data = await requestSearchAd<SearchAdCampaignEntity[]>('GET', '/ncc/campaigns', {
    recordSize: 1000,
  })
  return Array.isArray(data) ? data.filter((item) => item?.nccCampaignId) : []
}

async function listAdgroupsByCampaign(campaignId: string): Promise<SearchAdAdgroupEntity[]> {
  const data = await requestSearchAd<SearchAdAdgroupEntity[]>('GET', '/ncc/adgroups', {
    nccCampaignId: campaignId,
    recordSize: 1000,
  })
  return Array.isArray(data) ? data.filter((item) => item?.nccAdgroupId) : []
}

async function listKeywordsByAdgroup(adgroupId: string): Promise<SearchAdKeywordEntity[]> {
  const data = await requestSearchAd<SearchAdKeywordEntity[]>('GET', '/ncc/keywords', {
    nccAdgroupId: adgroupId,
    recordSize: 1000,
  })
  return Array.isArray(data) ? data.filter((item) => item?.nccKeywordId) : []
}

async function fetchSummaryStats(ids: string[], timeRange: { since: string; until: string }) {
  const statMap = new Map<string, SearchAdStatRow>()
  if (ids.length === 0) return statMap

  for (const chunk of chunkIds(ids)) {
    const payload = await requestSearchAd<{ data?: SearchAdStatRow[]; summaryStatResponse?: { data?: SearchAdStatRow[] } }>('GET', '/stats', {
      ids: chunk.join(','),
      fields: JSON.stringify(STAT_FIELDS),
      timeRange: JSON.stringify(timeRange),
      timeIncrement: 'allDays',
    })

    const rows = payload?.data || payload?.summaryStatResponse?.data || []
    for (const row of rows) {
      if (row?.id) statMap.set(row.id, row)
    }
  }

  return statMap
}

async function fetchCampaignDailyStats(campaignIds: string[], timeRange: { since: string; until: string }) {
  const dailyMap = new Map<string, NaverSearchAdDailyPoint>()
  if (campaignIds.length === 0) return []

  await runWithConcurrency(campaignIds, async (campaignId) => {
    const payload = await requestSearchAd<{ data?: SearchAdDailyRow[]; dailyStatResponse?: { data?: SearchAdDailyRow[] } }>('GET', '/stats', {
      id: campaignId,
      fields: JSON.stringify(STAT_FIELDS),
      timeRange: JSON.stringify(timeRange),
      timeIncrement: '1',
    })

    const rows = payload?.data || payload?.dailyStatResponse?.data || []
    for (const row of rows) {
      const date = String(row.dateStart || row.dateEnd || '').slice(0, 10)
      if (!date) continue

      const current = dailyMap.get(date) || {
        date,
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        purchaseConversions: 0,
        purchaseConversionValue: 0,
      }

      current.spend += toInteger(row.salesAmt)
      current.impressions += toInteger(row.impCnt)
      current.clicks += toInteger(row.clkCnt)
      current.conversions += toInteger(row.ccnt)
      current.purchaseConversions += toInteger(row.purchaseCcnt)
      current.purchaseConversionValue += toInteger(row.purchaseConvAmt)
      dailyMap.set(date, current)
    }

    return true
  }, 4)

  return [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))
}

async function fetchCampaignMonthlyStats(campaignIds: string[], ranges: Array<{ month: string; timeRange: { since: string; until: string } }>) {
  const monthlyRows: NaverSearchAdMonthlyPoint[] = []
  if (campaignIds.length === 0 || ranges.length === 0) return monthlyRows

  for (const range of ranges) {
    const statMap = await fetchSummaryStats(campaignIds, range.timeRange)
    let spend = 0
    let impressions = 0
    let clicks = 0
    let conversions = 0
    let purchaseConversions = 0
    let purchaseConversionValue = 0

    for (const row of statMap.values()) {
      spend += toInteger(row.salesAmt)
      impressions += toInteger(row.impCnt)
      clicks += toInteger(row.clkCnt)
      conversions += toInteger(row.ccnt)
      purchaseConversions += toInteger(row.purchaseCcnt)
      purchaseConversionValue += toInteger(row.purchaseConvAmt)
    }

    monthlyRows.push({
      month: range.month,
      label: range.month.replace('-', '.'),
      spend,
      impressions,
      clicks,
      conversions,
      purchaseConversions,
      purchaseConversionValue,
      roas: computeNaverSearchAdRoas(spend, purchaseConversionValue),
    })
  }

  return monthlyRows
}

export async function fetchNaverSearchAdTrendByMonth(monthTokenInput: unknown, options?: { force?: boolean }): Promise<NaverSearchAdDailyPoint[]> {
  const monthToken = normalizeNaverSearchAdMonthToken(monthTokenInput)
  if (!monthToken) {
    throw createError({
      statusCode: 400,
      message: '유효한 월 값이 아닙니다.',
    })
  }

  const cacheKey = monthToken
  const now = Date.now()
  if (!options?.force) {
    const cached = trendCache.get(cacheKey)
    if (cached && cached.expiresAt > now) return cached.value
  }

  const campaigns = await listCampaigns()
  const daily = await fetchCampaignDailyStats(
    campaigns.map((campaign) => campaign.nccCampaignId),
    buildMonthTimeRange(monthToken),
  )

  trendCache.set(cacheKey, {
    expiresAt: now + NAVER_SEARCHAD_CACHE_TTL_MS,
    value: daily,
  })

  return daily
}

async function fetchRelatedKeywords(hintKeywords: string[]) {
  if (hintKeywords.length === 0) return []

  const payload = await requestSearchAd<{ keywordList?: Array<Record<string, any>> }>('GET', '/keywordstool', {
    hintKeywords: hintKeywords.join(','),
    showDetail: 1,
  })

  const rows = payload?.keywordList || []

  return rows
    .map<NaverSearchAdRelatedKeywordRow>((item) => ({
      keyword: String(item.relKeyword || '').trim(),
      monthlyPcQueries: parseNaverSearchAdMonthlyValue(item.monthlyPcQcCnt),
      monthlyMobileQueries: parseNaverSearchAdMonthlyValue(item.monthlyMobileQcCnt),
      monthlyPcClicks: parseNaverSearchAdMonthlyValue(item.monthlyAvePcClkCnt),
      monthlyMobileClicks: parseNaverSearchAdMonthlyValue(item.monthlyAveMobileClkCnt),
      monthlyPcCtr: toNumber(item.monthlyAvePcCtr),
      monthlyMobileCtr: toNumber(item.monthlyAveMobileCtr),
      competition: formatNaverSearchAdCompetition(item.compIdx),
      averageDepth: parseNaverSearchAdMonthlyValue(item.plAvgDepth),
    }))
    .filter((item) => item.keyword)
    .sort((a, b) => ((b.monthlyPcQueries || 0) + (b.monthlyMobileQueries || 0)) - ((a.monthlyPcQueries || 0) + (a.monthlyMobileQueries || 0)))
    .slice(0, NAVER_SEARCHAD_RELATED_KEYWORD_LIMIT)
}

function buildCampaignRows(campaigns: SearchAdCampaignEntity[], statMap: Map<string, SearchAdStatRow>): NaverSearchAdCampaignRow[] {
  return campaigns
    .map((campaign) => {
      const stats = statMap.get(campaign.nccCampaignId)
      const spend = toInteger(stats?.salesAmt)
      const purchaseConversionValue = toInteger(stats?.purchaseConvAmt)

      return {
        id: campaign.nccCampaignId,
        name: campaign.name || campaign.nccCampaignId,
        status: String(campaign.status || 'UNKNOWN'),
        dailyBudget: campaign.dailyBudget === null || campaign.dailyBudget === undefined ? null : toInteger(campaign.dailyBudget),
        spend,
        impressions: toInteger(stats?.impCnt),
        clicks: toInteger(stats?.clkCnt),
        ctr: toNumber(stats?.ctr),
        avgCpc: toNumber(stats?.cpc),
        conversions: toInteger(stats?.ccnt),
        purchaseConversions: toInteger(stats?.purchaseCcnt),
        purchaseConversionValue,
        roas: computeNaverSearchAdRoas(spend, purchaseConversionValue),
      }
    })
    .sort((a, b) => b.spend - a.spend)
}

function buildAdgroupRows(
  adgroups: SearchAdAdgroupEntity[],
  campaignsById: Map<string, SearchAdCampaignEntity>,
  statMap: Map<string, SearchAdStatRow>,
): NaverSearchAdAdgroupRow[] {
  return adgroups
    .map((adgroup) => {
      const stats = statMap.get(adgroup.nccAdgroupId)
      const spend = toInteger(stats?.salesAmt)
      const purchaseConversionValue = toInteger(stats?.purchaseConvAmt)

      return {
        id: adgroup.nccAdgroupId,
        campaignId: adgroup.nccCampaignId,
        campaignName: campaignsById.get(adgroup.nccCampaignId)?.name || adgroup.nccCampaignId,
        name: adgroup.name || adgroup.nccAdgroupId,
        status: String(adgroup.status || 'UNKNOWN'),
        bidAmount: adgroup.bidAmt === null || adgroup.bidAmt === undefined ? null : toInteger(adgroup.bidAmt),
        spend,
        clicks: toInteger(stats?.clkCnt),
        ctr: toNumber(stats?.ctr),
        avgCpc: toNumber(stats?.cpc),
        purchaseConversions: toInteger(stats?.purchaseCcnt),
        purchaseConversionValue,
        roas: computeNaverSearchAdRoas(spend, purchaseConversionValue),
      }
    })
    .sort((a, b) => b.spend - a.spend)
}

function buildKeywordRows(
  keywords: SearchAdKeywordEntity[],
  campaignsById: Map<string, SearchAdCampaignEntity>,
  adgroupsById: Map<string, SearchAdAdgroupEntity>,
  statMap: Map<string, SearchAdStatRow>,
): NaverSearchAdKeywordRow[] {
  return keywords
    .map((keyword) => {
      const stats = statMap.get(keyword.nccKeywordId)
      const spend = toInteger(stats?.salesAmt)
      const purchaseConversionValue = toInteger(stats?.purchaseConvAmt)

      return {
        id: keyword.nccKeywordId,
        keyword: keyword.keyword || keyword.nccKeywordId,
        campaignId: keyword.nccCampaignId,
        campaignName: campaignsById.get(keyword.nccCampaignId)?.name || keyword.nccCampaignId,
        adgroupId: keyword.nccAdgroupId,
        adgroupName: adgroupsById.get(keyword.nccAdgroupId)?.name || keyword.nccAdgroupId,
        bidAmount: keyword.bidAmt === null || keyword.bidAmt === undefined ? null : toInteger(keyword.bidAmt),
        qualityIndex: keyword.nccQi?.qiGrade == null ? null : toInteger(keyword.nccQi.qiGrade),
        relevanceScore: keyword.adRelevanceScore == null ? null : toInteger(keyword.adRelevanceScore),
        expectedClickScore: keyword.expectedClickScore == null ? null : toInteger(keyword.expectedClickScore),
        spend,
        clicks: toInteger(stats?.clkCnt),
        ctr: toNumber(stats?.ctr),
        avgCpc: toNumber(stats?.cpc),
        purchaseConversions: toInteger(stats?.purchaseCcnt),
        purchaseConversionValue,
        roas: computeNaverSearchAdRoas(spend, purchaseConversionValue),
      }
    })
    .sort((a, b) => b.purchaseConversionValue - a.purchaseConversionValue || b.spend - a.spend)
}

export async function fetchNaverSearchAdOverview(
  presetInput: unknown,
  options?: { force?: boolean; drillMonth?: string },
): Promise<NaverSearchAdOverviewResponse> {
  const range = buildNaverSearchAdTimeRange(presetInput)
  const monthlyRanges = buildNaverSearchAdMonthlyRanges()
  const drillMonth = normalizeNaverSearchAdMonthToken(options?.drillMonth)
  const cacheKey = `${range.preset}:${drillMonth || 'root'}`
  const now = Date.now()

  if (!options?.force) {
    const cached = overviewCache.get(cacheKey)
    if (cached && cached.expiresAt > now) return cached.value
  }

  const campaigns = await listCampaigns()
  const campaignsById = new Map(campaigns.map((campaign) => [campaign.nccCampaignId, campaign]))
  const adgroupMatrix = await runWithConcurrency(
    campaigns.map((campaign) => campaign.nccCampaignId),
    (campaignId) => listAdgroupsByCampaign(campaignId),
    4,
  )
  const adgroups = adgroupMatrix.flat()
  const adgroupsById = new Map(adgroups.map((adgroup) => [adgroup.nccAdgroupId, adgroup]))

  const [campaignStatMap, adgroupStatMap] = await Promise.all([
    fetchSummaryStats(campaigns.map((campaign) => campaign.nccCampaignId), range.timeRange),
    fetchSummaryStats(adgroups.map((adgroup) => adgroup.nccAdgroupId), range.timeRange),
  ])

  const campaignRows = buildCampaignRows(campaigns, campaignStatMap)
  const adgroupRows = buildAdgroupRows(adgroups, campaignsById, adgroupStatMap)
  const monthly = trimMonthlyRows(await fetchCampaignMonthlyStats(
    campaigns.map((campaign) => campaign.nccCampaignId),
    monthlyRanges,
  ))
  const daily = drillMonth
    ? await fetchCampaignDailyStats(
        campaigns.map((campaign) => campaign.nccCampaignId),
        buildMonthTimeRange(drillMonth),
      )
    : []

  let keywords: SearchAdKeywordEntity[] = []
  let keywordRows: NaverSearchAdKeywordRow[] = []
  try {
    const keywordMatrix = await runWithConcurrency(
      adgroupRows.filter((row) => row.spend > 0 || row.clicks > 0).slice(0, NAVER_SEARCHAD_TOP_ADGROUP_LIMIT).map((row) => row.id),
      (adgroupId) => listKeywordsByAdgroup(adgroupId),
      2,
    )
    keywords = keywordMatrix.flat()
    const keywordStatMap = await fetchSummaryStats(keywords.map((keyword) => keyword.nccKeywordId), range.timeRange)
    keywordRows = buildKeywordRows(keywords, campaignsById, adgroupsById, keywordStatMap)
  } catch {
    keywords = []
    keywordRows = []
  }

  let relatedKeywords: NaverSearchAdRelatedKeywordRow[] = []
  try {
    relatedKeywords = await fetchRelatedKeywords(
      [...new Set(keywordRows.map((row) => row.keyword).filter(Boolean))].slice(0, 5),
    )
  } catch {
    relatedKeywords = []
  }

  const summary = campaignRows.reduce((acc, row) => {
    acc.spend += row.spend
    acc.impressions += row.impressions
    acc.clicks += row.clicks
    acc.conversions += row.conversions
    acc.purchaseConversions += row.purchaseConversions
    acc.purchaseConversionValue += row.purchaseConversionValue
    return acc
  }, {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    purchaseConversions: 0,
    purchaseConversionValue: 0,
  })

  const overview: NaverSearchAdOverviewResponse = {
    preset: range.preset,
    label: range.label,
    sourceLabel: '광고 기준',
    summary: {
      campaignCount: campaigns.length,
      adgroupCount: adgroups.length,
      keywordCount: keywords.length,
      spend: summary.spend,
      impressions: summary.impressions,
      clicks: summary.clicks,
      ctr: summary.impressions > 0 ? Number(((summary.clicks / summary.impressions) * 100).toFixed(2)) : 0,
      avgCpc: summary.clicks > 0 ? Math.round(summary.spend / summary.clicks) : 0,
      conversions: summary.conversions,
      purchaseConversions: summary.purchaseConversions,
      purchaseConversionValue: summary.purchaseConversionValue,
      roas: computeNaverSearchAdRoas(summary.spend, summary.purchaseConversionValue),
    },
    monthly,
    daily,
    topCampaigns: campaignRows.slice(0, 8),
    topAdgroups: adgroupRows.slice(0, 10),
    topKeywords: keywordRows.slice(0, NAVER_SEARCHAD_TOP_KEYWORD_LIMIT),
    relatedKeywords,
  }

  overviewCache.set(cacheKey, {
    expiresAt: now + NAVER_SEARCHAD_CACHE_TTL_MS,
    value: overview,
  })

  return overview
}
