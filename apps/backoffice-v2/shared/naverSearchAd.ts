export type NaverSearchAdPreset = 'thisMonth' | 'last30days' | 'last7days'

export interface NaverSearchAdSummary {
  campaignCount: number
  adgroupCount: number
  keywordCount: number
  spend: number
  impressions: number
  clicks: number
  ctr: number
  avgCpc: number
  conversions: number
  purchaseConversions: number
  purchaseConversionValue: number
  roas: number
}

export interface NaverSearchAdDailyPoint {
  date: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  purchaseConversions: number
  purchaseConversionValue: number
}

export interface NaverSearchAdMonthlyPoint {
  month: string
  label: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  purchaseConversions: number
  purchaseConversionValue: number
  roas: number
}

export interface NaverSearchAdCampaignRow {
  id: string
  name: string
  status: string
  dailyBudget: number | null
  spend: number
  impressions: number
  clicks: number
  ctr: number
  avgCpc: number
  conversions: number
  purchaseConversions: number
  purchaseConversionValue: number
  roas: number
}

export interface NaverSearchAdAdgroupRow {
  id: string
  campaignId: string
  campaignName: string
  name: string
  status: string
  bidAmount: number | null
  spend: number
  clicks: number
  ctr: number
  avgCpc: number
  purchaseConversions: number
  purchaseConversionValue: number
  roas: number
}

export interface NaverSearchAdKeywordRow {
  id: string
  keyword: string
  campaignId: string
  campaignName: string
  adgroupId: string
  adgroupName: string
  bidAmount: number | null
  qualityIndex: number | null
  relevanceScore: number | null
  expectedClickScore: number | null
  spend: number
  clicks: number
  ctr: number
  avgCpc: number
  purchaseConversions: number
  purchaseConversionValue: number
  roas: number
}

export interface NaverSearchAdRelatedKeywordRow {
  keyword: string
  monthlyPcQueries: number | null
  monthlyMobileQueries: number | null
  monthlyPcClicks: number | null
  monthlyMobileClicks: number | null
  monthlyPcCtr: number | null
  monthlyMobileCtr: number | null
  competition: string
  averageDepth: number | null
}

export interface NaverSearchAdOverviewResponse {
  preset: NaverSearchAdPreset
  label: string
  sourceLabel: string
  summary: NaverSearchAdSummary
  monthly: NaverSearchAdMonthlyPoint[]
  daily: NaverSearchAdDailyPoint[]
  topCampaigns: NaverSearchAdCampaignRow[]
  topAdgroups: NaverSearchAdAdgroupRow[]
  topKeywords: NaverSearchAdKeywordRow[]
  relatedKeywords: NaverSearchAdRelatedKeywordRow[]
}

export interface NaverSearchAdTrendResponse {
  month: string
  daily: NaverSearchAdDailyPoint[]
}

export const NAVER_SEARCHAD_PRESET_OPTIONS: Array<{ value: NaverSearchAdPreset; label: string }> = [
  { value: 'thisMonth', label: '이번 달' },
  { value: 'last30days', label: '최근 30일' },
  { value: 'last7days', label: '최근 7일' },
]

export function normalizeNaverSearchAdPreset(value: unknown): NaverSearchAdPreset {
  if (value === 'last7days' || value === 'last30days' || value === 'thisMonth') return value
  return 'thisMonth'
}

export function computeNaverSearchAdRoas(spend: number, conversionValue: number): number {
  if (!Number.isFinite(spend) || spend <= 0) return 0
  if (!Number.isFinite(conversionValue) || conversionValue <= 0) return 0
  return Number(((conversionValue / spend) * 100).toFixed(1))
}

export function parseNaverSearchAdMonthlyValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const text = String(value).trim()
  if (!text) return null
  if (text.startsWith('<')) return 9

  const parsed = Number(text.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function formatNaverSearchAdCompetition(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return '정보 없음'
  return text
}
