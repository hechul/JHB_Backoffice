import { createHash, createHmac, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildClientConfig,
  chunk,
  parseEnvFile,
  restRequest,
} from './sync-master-data.mjs'
import {
  buildCoupangCommerceProductMappingLookupFromRows,
  COUPANG_MARKETPLACE_FULFILLMENT_TYPE,
  COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE,
  buildCoupangProductLookupFromRows,
  buildCoupangMarketplaceRawLineRows,
  buildCoupangRocketGrowthRawLineRows,
  resolveCoupangSyncRecord,
} from '../server/utils/commerce/coupang-sync.ts'

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url))
const APP_ROOT = resolve(SCRIPT_DIR, '..')
const DEFAULT_ENV = resolve(APP_ROOT, '.env')
const DEFAULT_API_BASE_URL = 'https://api-gateway.coupang.com'
const DEFAULT_MAX_PER_PAGE = 50
const DEFAULT_FULFILLMENT_TYPE = 'all'
const DEFAULT_REQUEST_INTERVAL_MS = 1200
const DEFAULT_MAX_RETRIES = 5
const DEFAULT_RETRY_BASE_DELAY_MS = 10000
const DEFAULT_REVENUE_EVENT_PREFIX = 'revenue'
const MARKETPLACE_ORDER_STATUSES = ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY', 'NONE_TRACKING']
const MARKETPLACE_RETURN_REQUEST_STATUSES = ['RU', 'UC', 'CC', 'PR']
const COUPANG_DATE_BASIS_LABELS = {
  [COUPANG_MARKETPLACE_FULFILLMENT_TYPE]: '주문생성일(createdAt)',
  [COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE]: '결제일(paidAt)',
}
const DEFAULT_SOURCE_FULFILLMENT_TYPE = 'default'

function printHelp() {
  console.log(`
Usage:
  node scripts/sync-coupang-orders.mjs --from=2026-03-01 --to=2026-03-03

Options:
  --from=VALUE                  Sync start. Supports YYYY-MM-DD
  --to=VALUE                    Sync end. Supports YYYY-MM-DD
  --env=PATH                    Env file path (default: ./.env)
  --account-key=VALUE           Source account key (default: default)
  --run-type=VALUE              manual_sync | backfill | incremental (default: manual_sync)
  --requested-by-account-id=ID  Optional profiles.id for audit
  --fulfillment-type=VALUE      all | marketplace | rocket_growth (default: all)
  --max-per-page=NUMBER         Coupang page size (default: 50)
  --request-interval-ms=NUMBER  Minimum delay between Coupang API requests (default: 1200)
  --max-retries=NUMBER          Retry count for transient/429 errors (default: 5)
  --retry-base-delay-ms=NUMBER  Base retry delay in milliseconds (default: 10000)
  --revenue-only                Skip order fetch and run only marketplace revenue enrichment
  --dry-run                     Fetch and transform without DB writes
  --help                        Show this help
`.trim())
}

function normalizeString(value) {
  return String(value ?? '').trim()
}

function parseArgs(argv) {
  const args = {
    envPath: DEFAULT_ENV,
    from: '',
    to: '',
    accountKey: 'default',
    runType: 'manual_sync',
    requestedByAccountId: null,
    fulfillmentType: DEFAULT_FULFILLMENT_TYPE,
    maxPerPage: DEFAULT_MAX_PER_PAGE,
    requestIntervalMs: DEFAULT_REQUEST_INTERVAL_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
    retryBaseDelayMs: DEFAULT_RETRY_BASE_DELAY_MS,
    revenueOnly: false,
    dryRun: false,
    help: false,
  }

  for (const rawArg of argv) {
    if (rawArg === '--dry-run') {
      args.dryRun = true
      continue
    }
    if (rawArg === '--revenue-only') {
      args.revenueOnly = true
      continue
    }
    if (rawArg === '--help' || rawArg === '-h') {
      args.help = true
      continue
    }
    if (rawArg.startsWith('--env=')) {
      args.envPath = resolve(process.cwd(), rawArg.slice('--env='.length))
      continue
    }
    if (rawArg.startsWith('--from=')) {
      args.from = normalizeString(rawArg.slice('--from='.length))
      continue
    }
    if (rawArg.startsWith('--to=')) {
      args.to = normalizeString(rawArg.slice('--to='.length))
      continue
    }
    if (rawArg.startsWith('--account-key=')) {
      args.accountKey = normalizeString(rawArg.slice('--account-key='.length)) || 'default'
      continue
    }
    if (rawArg.startsWith('--run-type=')) {
      args.runType = normalizeString(rawArg.slice('--run-type='.length)) || 'manual_sync'
      continue
    }
    if (rawArg.startsWith('--requested-by-account-id=')) {
      args.requestedByAccountId = normalizeString(rawArg.slice('--requested-by-account-id='.length)) || null
      continue
    }
    if (rawArg.startsWith('--fulfillment-type=')) {
      args.fulfillmentType = normalizeString(rawArg.slice('--fulfillment-type='.length)) || DEFAULT_FULFILLMENT_TYPE
      continue
    }
    if (rawArg.startsWith('--max-per-page=')) {
      const parsed = Number.parseInt(rawArg.slice('--max-per-page='.length), 10)
      args.maxPerPage = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PER_PAGE
      continue
    }
    if (rawArg.startsWith('--request-interval-ms=')) {
      const parsed = Number.parseInt(rawArg.slice('--request-interval-ms='.length), 10)
      args.requestIntervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUEST_INTERVAL_MS
      continue
    }
    if (rawArg.startsWith('--max-retries=')) {
      const parsed = Number.parseInt(rawArg.slice('--max-retries='.length), 10)
      args.maxRetries = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_RETRIES
      continue
    }
    if (rawArg.startsWith('--retry-base-delay-ms=')) {
      const parsed = Number.parseInt(rawArg.slice('--retry-base-delay-ms='.length), 10)
      args.retryBaseDelayMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETRY_BASE_DELAY_MS
      continue
    }
    throw new Error(`Unknown argument: ${rawArg}`)
  }

  if (!args.help && (!args.from || !args.to)) {
    throw new Error('--from and --to are required')
  }

  if (!['manual_sync', 'backfill', 'incremental'].includes(args.runType)) {
    throw new Error(`Unsupported run type: ${args.runType}`)
  }

  if (!['all', COUPANG_MARKETPLACE_FULFILLMENT_TYPE, COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE].includes(args.fulfillmentType)) {
    throw new Error(`Unsupported fulfillment type: ${args.fulfillmentType}`)
  }

  return args
}

function validateDateInput(value, fieldLabel) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizeString(value))) {
    throw new Error(`${fieldLabel} must be YYYY-MM-DD`)
  }
}

export function buildSelectedFulfillmentTypes(fulfillmentType) {
  if (fulfillmentType === 'all') {
    return [COUPANG_MARKETPLACE_FULFILLMENT_TYPE, COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE]
  }
  return [fulfillmentType]
}

export function buildCoupangConfig(env) {
  const vendorId = normalizeString(env.COUPANG_VENDOR_ID)
  const accessKey = normalizeString(env.COUPANG_ACCESS_KEY)
  const secretKey = normalizeString(env.COUPANG_SECRET_KEY)
  const apiBaseUrl = normalizeString(env.COUPANG_API_BASE_URL || DEFAULT_API_BASE_URL)
  const requestIntervalMs = Number.parseInt(String(env.COUPANG_REQUEST_INTERVAL_MS || ''), 10) || DEFAULT_REQUEST_INTERVAL_MS
  const maxRetries = Number.parseInt(String(env.COUPANG_MAX_RETRIES || ''), 10) || DEFAULT_MAX_RETRIES
  const retryBaseDelayMs = Number.parseInt(String(env.COUPANG_RETRY_BASE_DELAY_MS || ''), 10) || DEFAULT_RETRY_BASE_DELAY_MS

  if (!vendorId || !accessKey || !secretKey) {
    throw new Error('COUPANG_VENDOR_ID, COUPANG_ACCESS_KEY and COUPANG_SECRET_KEY are required')
  }

  return {
    vendorId,
    accessKey,
    secretKey,
    apiBaseUrl,
    requestIntervalMs,
    maxRetries,
    retryBaseDelayMs,
  }
}

export function formatCoupangSignedDate(date = new Date()) {
  const yy = String(date.getUTCFullYear()).slice(-2)
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mi = String(date.getUTCMinutes()).padStart(2, '0')
  const ss = String(date.getUTCSeconds()).padStart(2, '0')
  return `${yy}${mm}${dd}T${hh}${mi}${ss}Z`
}

export function buildCoupangAuthorizationHeader(input) {
  const signedDate = input.signedDate || formatCoupangSignedDate(input.date)
  const message = `${signedDate}${input.method}${input.path}${input.query || ''}`
  const signature = createHmac('sha256', input.secretKey).update(message, 'utf8').digest('hex')
  return `CEA algorithm=HmacSHA256, access-key=${input.accessKey}, signed-date=${signedDate}, signature=${signature}`
}

export function toMarketplaceDateBoundary(value, boundary = 'start') {
  const normalized = normalizeString(value)
  if (!normalized) return ''
  return `${normalized}+09:00`
}

export function toMarketplaceClaimDate(value) {
  return normalizeString(value)
}

export function toRocketGrowthYmd(value) {
  return normalizeString(value).replace(/-/g, '')
}

export function enumerateIsoDateRange(from, to) {
  const start = normalizeString(from)
  const end = normalizeString(to)
  if (!start || !end) return []
  if (start > end) return []

  const parseIsoDate = (value) => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return null
    const [, year, month, day] = match
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  }

  const dates = []
  const cursor = parseIsoDate(start)
  const last = parseIsoDate(end)
  if (!cursor || !last) return []

  while (cursor.getTime() <= last.getTime()) {
    const year = cursor.getUTCFullYear()
    const month = String(cursor.getUTCMonth() + 1).padStart(2, '0')
    const day = String(cursor.getUTCDate()).padStart(2, '0')
    dates.push(`${year}-${month}-${day}`)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dates
}

function parseIsoDate(value) {
  const match = normalizeString(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, year, month, day] = match
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
}

function formatIsoDate(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function currentLocalIsoDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function currentLocalYesterdayIsoDate() {
  const today = parseIsoDate(currentLocalIsoDate())
  if (!today) return currentLocalIsoDate()
  today.setUTCDate(today.getUTCDate() - 1)
  return formatIsoDate(today)
}

function maxIsoDate(left, right) {
  const normalizedLeft = normalizeString(left)
  const normalizedRight = normalizeString(right)
  if (!normalizedLeft) return normalizedRight
  if (!normalizedRight) return normalizedLeft
  return normalizedLeft >= normalizedRight ? normalizedLeft : normalizedRight
}

function minIsoDate(left, right) {
  const normalizedLeft = normalizeString(left)
  const normalizedRight = normalizeString(right)
  if (!normalizedLeft) return normalizedRight
  if (!normalizedRight) return normalizedLeft
  return normalizedLeft <= normalizedRight ? normalizedLeft : normalizedRight
}

function hashRevenuePayload(input) {
  return createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
    .slice(0, 16)
}

export function resolveRevenueRecognitionWindow(input) {
  const yesterday = currentLocalYesterdayIsoDate()
  const recognitionFrom = normalizeString(input?.recognitionFrom)
  const requestedTo = normalizeString(input?.recognitionTo) || yesterday
  const recognitionTo = minIsoDate(requestedTo, yesterday)

  if (!recognitionFrom || !recognitionTo || recognitionFrom > recognitionTo) {
    return {
      recognitionFrom: recognitionFrom || null,
      recognitionTo: recognitionTo || null,
      isEmpty: true,
    }
  }

  return {
    recognitionFrom,
    recognitionTo,
    isEmpty: false,
  }
}

export function splitIsoDateRangeByMonth(from, to) {
  const start = parseIsoDate(from)
  const end = parseIsoDate(to)
  if (!start || !end || start.getTime() > end.getTime()) return []

  const windows = []
  const cursor = new Date(start.getTime())

  while (cursor.getTime() <= end.getTime()) {
    const windowStart = new Date(cursor.getTime())
    const monthEnd = new Date(Date.UTC(
      windowStart.getUTCFullYear(),
      windowStart.getUTCMonth() + 1,
      0,
    ))
    const windowEnd = monthEnd.getTime() < end.getTime()
      ? monthEnd
      : new Date(end.getTime())

    windows.push({
      from: formatIsoDate(windowStart),
      to: formatIsoDate(windowEnd),
    })

    const nextCursor = new Date(windowEnd.getTime())
    nextCursor.setUTCDate(nextCursor.getUTCDate() + 1)
    cursor.setTime(nextCursor.getTime())
  }

  return windows
}

export function dedupeCoupangRawLineRows(rows) {
  const dedupedMap = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.source_line_id || '').trim()
    if (!key) continue
    // marketplace/status 재조회 중복이 발생하면 나중 row가 더 최신 상태일 가능성이 높다.
    dedupedMap.set(key, row)
  }

  return Array.from(dedupedMap.values())
}

export function describeCoupangDateBasis(fulfillmentType) {
  if (fulfillmentType === COUPANG_MARKETPLACE_FULFILLMENT_TYPE) {
    return {
      key: 'created_at',
      label: COUPANG_DATE_BASIS_LABELS[COUPANG_MARKETPLACE_FULFILLMENT_TYPE],
    }
  }

  if (fulfillmentType === COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE) {
    return {
      key: 'paid_at',
      label: COUPANG_DATE_BASIS_LABELS[COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE],
    }
  }

  return {
    key: 'mixed',
    label: `${COUPANG_DATE_BASIS_LABELS[COUPANG_MARKETPLACE_FULFILLMENT_TYPE]} / ${COUPANG_DATE_BASIS_LABELS[COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE]}`,
  }
}

export function buildMarketplaceOrderIdentityKey(order, orderIndex = 0) {
  const shipmentBoxId = normalizeString(order?.shipmentBoxId)
  if (shipmentBoxId) return `marketplace:shipment_box:${shipmentBoxId}`

  const orderId = normalizeString(order?.orderId)
  if (orderId) return `marketplace:order:${orderId}`

  return `marketplace:index:${orderIndex}`
}

export function buildRocketGrowthOrderIdentityKey(order, orderIndex = 0) {
  const orderId = normalizeString(order?.orderId)
  if (orderId) return `rocket_growth:order:${orderId}`
  return `rocket_growth:index:${orderIndex}`
}

export function countUniqueCoupangOrders(orders, fulfillmentType) {
  const seen = new Set()
  const rows = Array.isArray(orders) ? orders : []

  rows.forEach((order, orderIndex) => {
    const key = fulfillmentType === COUPANG_MARKETPLACE_FULFILLMENT_TYPE
      ? buildMarketplaceOrderIdentityKey(order, orderIndex)
      : buildRocketGrowthOrderIdentityKey(order, orderIndex)
    seen.add(key)
  })

  return seen.size
}

function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve()
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms)
  })
}

export function extractRetryAfterMs(response) {
  const headerValue = response.headers.get('retry-after')
  if (!headerValue) return null

  const numeric = Number.parseInt(headerValue, 10)
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric * 1000
  }

  const timestamp = Date.parse(headerValue)
  if (Number.isNaN(timestamp)) return null
  const delayMs = timestamp - Date.now()
  return delayMs > 0 ? delayMs : null
}

export function computeRetryDelayMs(response, attempt, coupangConfig) {
  const retryAfterMs = extractRetryAfterMs(response)
  if (retryAfterMs) {
    return retryAfterMs
  }

  const baseDelayMs = response.status === 429
    ? Math.max(coupangConfig.retryBaseDelayMs, 10000)
    : Math.max(Math.floor(coupangConfig.retryBaseDelayMs / 2), 2000)

  const exponentialDelayMs = baseDelayMs * (2 ** attempt)
  return Math.min(exponentialDelayMs, 120000)
}

async function coupangRequestJson(coupangConfig, requestState, input) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input.params || {})) {
    const normalized = normalizeString(value)
    if (!normalized && key !== 'token') continue
    params.set(key, normalized)
  }

  const query = params.toString()
  const url = `${coupangConfig.apiBaseUrl}${input.path}${query ? `?${query}` : ''}`
  let attempt = 0

  while (true) {
    const waitMs = Math.max(0, requestState.lastRequestAt + coupangConfig.requestIntervalMs - Date.now())
    if (waitMs > 0) {
      await sleep(waitMs)
    }
    requestState.lastRequestAt = Date.now()

    const authorization = buildCoupangAuthorizationHeader({
      accessKey: coupangConfig.accessKey,
      secretKey: coupangConfig.secretKey,
      method: input.method,
      path: input.path,
      query,
    })

    const response = await fetch(url, {
      method: input.method,
      headers: {
        Authorization: authorization,
        'X-Requested-By': coupangConfig.vendorId,
        'Content-Type': 'application/json;charset=UTF-8',
        ...(input.headers || {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
    })

    const text = await response.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }

    if (response.ok) {
      return data
    }

    const canRetry = (response.status === 429 || response.status >= 500) && attempt < coupangConfig.maxRetries
    if (canRetry) {
      const delayMs = computeRetryDelayMs(response, attempt, coupangConfig)
      console.warn(
        `[coupang-sync] retry ${attempt + 1}/${coupangConfig.maxRetries} for ${input.path} after ${delayMs}ms (${response.status} ${response.statusText})`,
      )
      attempt += 1
      await sleep(delayMs)
      continue
    }

    throw new Error(`Coupang API request failed: ${response.status} ${response.statusText} ${text}`)
  }
}

function isMissingColumnError(error, columnName) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(columnName)
    && (
      message.includes('schema cache')
      || message.includes('column')
      || message.includes('Could not find')
      || message.includes('does not exist')
    )
}

async function supportsRestColumn(targetConfig, table, column) {
  try {
    await restRequest(targetConfig, `${table}?select=${encodeURIComponent(column)}&limit=1`, { method: 'GET' })
    return true
  } catch (error) {
    if (isMissingColumnError(error, column)) return false
    throw error
  }
}

async function detectSourceScopeSupport(targetConfig) {
  const [
    commerceSyncRuns,
    commerceSyncCursors,
    commerceOrderEventsRaw,
    commerceOrderLinesRaw,
    commerceProductMappings,
    purchases,
    purchaseAmounts,
  ] = await Promise.all([
    supportsRestColumn(targetConfig, 'commerce_sync_runs', 'source_fulfillment_type'),
    supportsRestColumn(targetConfig, 'commerce_sync_cursors', 'source_fulfillment_type'),
    supportsRestColumn(targetConfig, 'commerce_order_events_raw', 'source_fulfillment_type'),
    supportsRestColumn(targetConfig, 'commerce_order_lines_raw', 'source_fulfillment_type'),
    supportsRestColumn(targetConfig, 'commerce_product_mappings', 'source_fulfillment_type'),
    supportsRestColumn(targetConfig, 'purchases', 'source_fulfillment_type'),
    supportsRestColumn(targetConfig, 'purchases', 'payment_amount'),
  ])

  return {
    commerceSyncRuns,
    commerceSyncCursors,
    commerceOrderEventsRaw,
    commerceOrderLinesRaw,
    commerceProductMappings,
    purchases,
    purchaseAmounts,
  }
}

function assertLiveSchemaSupport(sourceScopeSupport) {
  if (
    sourceScopeSupport.commerceSyncRuns
    && sourceScopeSupport.commerceSyncCursors
    && sourceScopeSupport.commerceOrderEventsRaw
    && sourceScopeSupport.commerceOrderLinesRaw
    && sourceScopeSupport.commerceProductMappings
    && sourceScopeSupport.purchases
  ) {
    return
  }

  throw new Error('Coupang live sync requires source_fulfillment_type columns. Apply 106_add_source_fulfillment_type.sql first.')
}

function maybeWithSourceFulfillmentType(row, enabled) {
  if (enabled) return row
  const { source_fulfillment_type: _ignored, ...rest } = row
  return rest
}

function maybeWithPurchaseAmountColumns(row, enabled) {
  if (enabled) return row
  const {
    payment_amount: _paymentAmount,
    order_discount_amount: _orderDiscountAmount,
    delivery_fee_amount: _deliveryFeeAmount,
    delivery_discount_amount: _deliveryDiscountAmount,
    expected_settlement_amount: _expectedSettlementAmount,
    payment_commission: _paymentCommission,
    sale_commission: _saleCommission,
    ...rest
  } = row
  return rest
}

async function upsertRows(targetConfig, table, conflictColumns, rows) {
  if (rows.length === 0) return

  for (const batch of chunk(rows, 500)) {
    await restRequest(targetConfig, `${table}?on_conflict=${encodeURIComponent(conflictColumns)}`, {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    })
  }
}

async function fetchActiveProducts(targetConfig) {
  const query = 'products?select=product_id,product_name,option_name&deleted_at=is.null&order=product_name.asc'
  const rows = await restRequest(targetConfig, query, { method: 'GET' })
  return Array.isArray(rows) ? rows : []
}

async function fetchCommerceProductMappings(targetConfig, accountKey, sourceScopeSupport) {
  const normalizedAccountKey = String(accountKey || 'default').trim() || 'default'
  const selectColumns = [
    'id',
    'source_channel',
    ...(sourceScopeSupport?.commerceProductMappings ? ['source_fulfillment_type'] : []),
    'source_account_key',
    'commerce_product_id',
    'commerce_option_code',
    'commerce_product_name',
    'commerce_option_name',
    'internal_product_id',
    'matching_mode',
    'canonical_variant',
    'rule_json',
    'priority',
    'is_active',
  ]

  const query = [
    `commerce_product_mappings?select=${selectColumns.join(',')}`,
    'source_channel=eq.coupang',
    ...(sourceScopeSupport?.commerceProductMappings
      ? [`source_fulfillment_type=in.(${[DEFAULT_SOURCE_FULFILLMENT_TYPE, COUPANG_MARKETPLACE_FULFILLMENT_TYPE, COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE].join(',')})`]
      : []),
    'is_active=is.true',
    `or=${encodeURIComponent(`(source_account_key.eq.default,source_account_key.eq.${normalizedAccountKey})`)}`,
    'order=priority.asc,id.asc',
  ].join('&')

  const rows = await restRequest(targetConfig, query, { method: 'GET' })
  return Array.isArray(rows) ? rows : []
}

async function deleteProjectedPurchases(targetConfig, purchaseIds, accountKey, sourceScopeSupport) {
  if (purchaseIds.length === 0) return

  for (const batch of chunk(purchaseIds, 200)) {
    const encodedIds = batch.map((id) => `"${id}"`).join(',')
    const query = [
      `purchase_id=in.(${encodedIds})`,
      'source_channel=eq.coupang',
      `source_account_key=eq.${encodeURIComponent(accountKey)}`,
    ]

    if (sourceScopeSupport?.purchases) {
      query.push(
        `source_fulfillment_type=in.(${[
          COUPANG_MARKETPLACE_FULFILLMENT_TYPE,
          COUPANG_ROCKET_GROWTH_FULFILLMENT_TYPE,
        ].join(',')})`,
      )
    }

    await restRequest(targetConfig, `purchases?${query.join('&')}`, {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal',
      },
    })
  }
}

async function createSyncRun(targetConfig, args, requestedFrom, requestedTo, fulfillmentType) {
  const rows = await restRequest(targetConfig, 'commerce_sync_runs', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify([{
      source_channel: 'coupang',
      source_fulfillment_type: fulfillmentType,
      source_account_key: args.accountKey,
      run_type: args.runType,
      requested_by_account_id: args.requestedByAccountId,
      requested_from: requestedFrom,
      requested_to: requestedTo,
      status: 'running',
      summary_json: { dryRun: false, fulfillmentType },
    }]),
  })

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Failed to create commerce_sync_runs row for Coupang')
  }

  return rows[0]
}

async function updateSyncRun(targetConfig, runId, patch) {
  await restRequest(targetConfig, `commerce_sync_runs?id=eq.${encodeURIComponent(runId)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      ...patch,
      updated_at: new Date().toISOString(),
    }),
  })
}

async function updateCursor(targetConfig, args, runId, requestedFrom, requestedTo, fulfillmentType) {
  await restRequest(targetConfig, 'commerce_sync_cursors?on_conflict=source_channel,source_fulfillment_type,source_account_key', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([{
      source_channel: 'coupang',
      source_fulfillment_type: fulfillmentType,
      source_account_key: args.accountKey,
      last_success_from: requestedFrom,
      last_success_to: requestedTo,
      last_success_changed_at: null,
      last_run_id: runId,
      updated_at: new Date().toISOString(),
    }]),
  })
}

async function fetchMarketplaceOrders(coupangConfig, requestState, args) {
  const orders = []
  const days = enumerateIsoDateRange(args.from, args.to)

  for (const day of days) {
    for (const status of MARKETPLACE_ORDER_STATUSES) {
      let nextToken = '1'

      while (nextToken) {
        const currentToken = nextToken
        const payload = await coupangRequestJson(coupangConfig, requestState, {
          method: 'GET',
          path: `/v2/providers/openapi/apis/api/v5/vendors/${coupangConfig.vendorId}/ordersheets`,
          params: {
            createdAtFrom: toMarketplaceDateBoundary(day, 'start'),
            createdAtTo: toMarketplaceDateBoundary(day, 'end'),
            status,
            maxPerPage: String(args.maxPerPage),
            nextToken,
          },
        })

        const rows = Array.isArray(payload?.data) ? payload.data : []
        orders.push(...rows)
        nextToken = normalizeString(payload?.nextToken)
        if (!nextToken || nextToken === currentToken || rows.length === 0) {
          break
        }
      }
    }
  }

  return orders
}

async function fetchRocketGrowthOrders(coupangConfig, requestState, args) {
  const orders = []

  for (const window of splitIsoDateRangeByMonth(args.from, args.to)) {
    let nextToken = null

    while (true) {
      const currentToken = nextToken
      const params = {
        vendorId: coupangConfig.vendorId,
        paidDateFrom: toRocketGrowthYmd(window.from),
        paidDateTo: toRocketGrowthYmd(window.to),
        maxPerPage: String(args.maxPerPage),
      }
      if (nextToken) {
        params.nextToken = nextToken
      }

      const payload = await coupangRequestJson(coupangConfig, requestState, {
        method: 'GET',
        path: `/v2/providers/rg_open_api/apis/api/v1/vendors/${coupangConfig.vendorId}/rg/orders`,
        params,
      })

      const rows = Array.isArray(payload?.data) ? payload.data : []
      orders.push(...rows)
      nextToken = normalizeString(payload?.nextToken)
      if (!nextToken || nextToken === currentToken || rows.length === 0) {
        break
      }
    }
  }

  return orders
}

function buildSummaryPatch(summary, status, errorMessage = null) {
  return {
    status,
    completed_at: new Date().toISOString(),
    summary_json: summary,
    error_message: errorMessage,
  }
}

function createScopeSummary(fulfillmentType) {
  const dateBasis = describeCoupangDateBasis(fulfillmentType)
  return {
    fulfillmentType,
    dateBasisKey: dateBasis.key,
    dateBasisLabel: dateBasis.label,
    responseOrderCount: 0,
    fetchedOrderCount: 0,
    rawEventCount: 0,
    rawLineCount: 0,
    projectedCount: 0,
    excludedCount: 0,
    unresolvedCount: 0,
    deletedCount: 0,
    persistedRawEventCount: 0,
    persistedRawLineCount: 0,
    persistedPurchaseCount: 0,
    runId: null,
  }
}

function toMoneyNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function roundMoney(value) {
  return Math.round(toMoneyNumber(value) * 100) / 100
}

function toRevenueEventAt(input) {
  const normalized = normalizeString(input)
  return normalized ? `${normalized}T00:00:00+09:00` : null
}

function normalizeRevenueSaleType(value) {
  return normalizeString(value).toUpperCase() || 'UNKNOWN'
}

function revenueSign(saleType) {
  return normalizeRevenueSaleType(saleType) === 'REFUND' ? -1 : 1
}

function buildRevenueOrderItemKey(orderId, vendorItemId) {
  const normalizedOrderId = normalizeString(orderId)
  const normalizedVendorItemId = normalizeString(vendorItemId)
  return normalizedOrderId && normalizedVendorItemId
    ? `${normalizedOrderId}::${normalizedVendorItemId}`
    : ''
}

function buildRevenueEventSourceLineId(input) {
  const digest = hashRevenuePayload({
    record: input.record,
    item: input.item,
  })

  return [
    DEFAULT_REVENUE_EVENT_PREFIX,
    normalizeString(input.orderId) || 'unknown-order',
    normalizeString(input.vendorItemId) || 'unknown-item',
    normalizeRevenueSaleType(input.saleType),
    digest,
  ].join(':')
}

function allocateAmountAcrossWeights(totalAmount, weights) {
  const normalizedWeights = Array.isArray(weights) && weights.length > 0
    ? weights.map((weight) => {
        const numeric = Number(weight)
        return Number.isFinite(numeric) && numeric > 0 ? numeric : 1
      })
    : [1]

  const totalWeight = normalizedWeights.reduce((sum, weight) => sum + weight, 0) || normalizedWeights.length
  const sign = totalAmount < 0 ? -1 : 1
  let remainingUnits = Math.round(Math.abs(toMoneyNumber(totalAmount)) * 100)
  let remainingWeight = totalWeight

  return normalizedWeights.map((weight, index) => {
    if (index === normalizedWeights.length - 1) {
      const finalValue = remainingUnits / 100
      remainingUnits = 0
      remainingWeight = 0
      return sign * finalValue
    }

    const allocatedUnits = remainingWeight > 0
      ? Math.floor((remainingUnits * weight) / remainingWeight)
      : 0

    remainingUnits -= allocatedUnits
    remainingWeight -= weight
    return sign * (allocatedUnits / 100)
  })
}

async function fetchCoupangRevenueHistory(coupangConfig, requestState, args) {
  const records = []

  for (const window of splitIsoDateRangeByMonth(args.from, args.to)) {
    let nextToken = null

    while (true) {
      const currentToken = nextToken
      const params = {
        vendorId: coupangConfig.vendorId,
        recognitionDateFrom: window.from,
        recognitionDateTo: window.to,
        maxPerPage: String(args.maxPerPage),
        token: nextToken || '',
      }

      const payload = await coupangRequestJson(coupangConfig, requestState, {
        method: 'GET',
        path: '/v2/providers/openapi/apis/api/v1/revenue-history',
        params,
      })

      const rows = Array.isArray(payload?.data) ? payload.data : []
      records.push(...rows)

      nextToken = normalizeString(payload?.nextToken)
      if (!payload?.hasNext || !nextToken || nextToken === currentToken || rows.length === 0) {
        break
      }
    }
  }

  return records
}

async function fetchCoupangMarketplacePurchasesByOrderIds(targetConfig, accountKey, orderIds) {
  const normalizedIds = [...new Set((Array.isArray(orderIds) ? orderIds : []).map((value) => normalizeString(value)).filter(Boolean))]
  const rows = []

  for (const batch of chunk(normalizedIds, 100)) {
    if (batch.length === 0) continue
    const encodedIds = batch.map((value) => `"${value}"`).join(',')
    const query = [
      'purchases?select=purchase_id,source_order_id,source_product_id,source_fulfillment_type,quantity',
      'source_channel=eq.coupang',
      `source_fulfillment_type=eq.${COUPANG_MARKETPLACE_FULFILLMENT_TYPE}`,
      `source_account_key=eq.${encodeURIComponent(accountKey)}`,
      `source_order_id=in.(${encodedIds})`,
      'limit=5000',
    ].join('&')
    const batchRows = await restRequest(targetConfig, query, { method: 'GET' })
    if (Array.isArray(batchRows)) {
      rows.push(...batchRows)
    }
  }

  return rows
}

async function patchPurchaseAmountRows(targetConfig, rows) {
  for (const row of Array.isArray(rows) ? rows : []) {
    const purchaseId = normalizeString(row?.purchase_id)
    if (!purchaseId) continue

    await restRequest(targetConfig, `purchases?purchase_id=eq.${encodeURIComponent(purchaseId)}`, {
      method: 'PATCH',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        expected_settlement_amount: row.expected_settlement_amount,
        payment_commission: row.payment_commission,
        sale_commission: row.sale_commission,
      }),
    })
  }
}

async function fetchCoupangRevenueEventRowsByOrderIds(targetConfig, accountKey, orderIds) {
  const normalizedIds = [...new Set((Array.isArray(orderIds) ? orderIds : []).map((value) => normalizeString(value)).filter(Boolean))]
  const rows = []

  for (const batch of chunk(normalizedIds, 100)) {
    if (batch.length === 0) continue
    const encodedIds = batch.map((value) => `"${value}"`).join(',')
    const query = [
      'commerce_order_events_raw?select=source_order_id,source_line_id,source_fulfillment_type,event_type,event_at,extra_flags,raw_json',
      'source_channel=eq.coupang',
      `source_account_key=eq.${encodeURIComponent(accountKey)}`,
      `source_order_id=in.(${encodedIds})`,
      'limit=5000',
    ].join('&')
    const batchRows = await restRequest(targetConfig, query, { method: 'GET' })
    if (Array.isArray(batchRows)) {
      rows.push(...batchRows)
    }
  }

  return rows
}

async function deleteRevenueEventRowsByOrderIdsInWindow(targetConfig, accountKey, orderIds, from, to) {
  const normalizedIds = [...new Set((Array.isArray(orderIds) ? orderIds : []).map((value) => normalizeString(value)).filter(Boolean))]
  if (normalizedIds.length === 0) return

  const eventFrom = `${from}T00:00:00+09:00`
  const eventTo = `${to}T23:59:59+09:00`

  for (const batch of chunk(normalizedIds, 100)) {
    const encodedIds = batch.map((value) => `"${value}"`).join(',')
    const query = [
      `source_order_id=in.(${encodedIds})`,
      'source_channel=eq.coupang',
      `source_account_key=eq.${encodeURIComponent(accountKey)}`,
      'source_line_id=like.revenue:*',
      `event_at=gte.${encodeURIComponent(eventFrom)}`,
      `event_at=lte.${encodeURIComponent(eventTo)}`,
    ]

    await restRequest(targetConfig, `commerce_order_events_raw?${query.join('&')}`, {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal',
      },
    })
  }
}

function buildPurchaseLookupByRevenueKey(purchaseRows) {
  const lookup = new Map()

  for (const row of Array.isArray(purchaseRows) ? purchaseRows : []) {
    const key = buildRevenueOrderItemKey(row?.source_order_id, row?.source_product_id)
    if (!key) continue
    const bucket = lookup.get(key)
    if (bucket) {
      bucket.push(row)
    } else {
      lookup.set(key, [row])
    }
  }

  return lookup
}

export function buildRevenueHistoryEventRows(input) {
  const purchaseLookup = input.purchaseLookup instanceof Map
    ? input.purchaseLookup
    : buildPurchaseLookupByRevenueKey(input.purchaseRows)
  const eventRows = []

  for (const record of Array.isArray(input.records) ? input.records : []) {
    const orderId = normalizeString(record?.orderId)
    const saleType = normalizeRevenueSaleType(record?.saleType)
    const sign = revenueSign(saleType)
    const items = Array.isArray(record?.items) ? record.items : []
    const matchedItems = items.filter((item) => purchaseLookup.has(buildRevenueOrderItemKey(orderId, item?.vendorItemId)))
    const totalMatchedSaleAmount = matchedItems.reduce((sum, item) => sum + Math.abs(toMoneyNumber(item?.saleAmount)), 0)
    const orderDeliverySettlementAmount = toMoneyNumber(record?.deliveryFee?.settlementAmount)
    const orderDeliveryCommissionAmount = toMoneyNumber(record?.deliveryFee?.fee) + toMoneyNumber(record?.deliveryFee?.feeVat)

    for (const item of matchedItems) {
      const vendorItemId = normalizeString(item?.vendorItemId)
      const matchKey = buildRevenueOrderItemKey(orderId, vendorItemId)
      const matchedPurchases = purchaseLookup.get(matchKey) || []
      if (matchedPurchases.length === 0) continue

      const matchedItemSaleAmount = Math.abs(toMoneyNumber(item?.saleAmount))
      const deliveryRatio = totalMatchedSaleAmount > 0
        ? matchedItemSaleAmount / totalMatchedSaleAmount
        : 1 / matchedItems.length
      const itemSettlementAmount = sign * toMoneyNumber(item?.settlementAmount)
      const itemCommissionAmount = sign * (toMoneyNumber(item?.serviceFee) + toMoneyNumber(item?.serviceFeeVat))
      const deliverySettlementAmount = sign * orderDeliverySettlementAmount * deliveryRatio
      const deliveryCommissionAmount = sign * orderDeliveryCommissionAmount * deliveryRatio
      const expectedSettlementAmount = roundMoney(itemSettlementAmount + deliverySettlementAmount)
      const commissionAmount = roundMoney(itemCommissionAmount + deliveryCommissionAmount)
      const sourceFulfillmentType = normalizeString(matchedPurchases[0]?.source_fulfillment_type) || DEFAULT_SOURCE_FULFILLMENT_TYPE

      eventRows.push({
        source_channel: 'coupang',
        source_fulfillment_type: sourceFulfillmentType,
        source_account_key: input.accountKey,
        run_id: input.runId,
        window_id: null,
        source_order_id: orderId,
        source_line_id: buildRevenueEventSourceLineId({
          orderId,
          vendorItemId,
          saleType,
          record,
          item,
        }),
        event_type: `${DEFAULT_REVENUE_EVENT_PREFIX}:${saleType}`,
        event_at: toRevenueEventAt(record?.recognitionDate)
          || toRevenueEventAt(record?.settlementDate)
          || toRevenueEventAt(record?.saleDate)
          || new Date().toISOString(),
        order_status: null,
        payment_date: toRevenueEventAt(record?.saleDate),
        extra_flags: {
          sourceProductId: vendorItemId,
          saleType,
          recognitionDate: normalizeString(record?.recognitionDate) || null,
          settlementDate: normalizeString(record?.settlementDate) || null,
        },
        raw_json: {
          record,
          item,
          computed: {
            expectedSettlementAmount,
            commissionAmount,
          },
        },
      })
    }
  }

  return dedupeEventRows(eventRows)
}

export function aggregateRevenueEventRowsByOrderItem(rows) {
  const aggregateMap = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    const eventType = normalizeString(row?.event_type)
    if (!eventType.startsWith(`${DEFAULT_REVENUE_EVENT_PREFIX}:`)) continue

    const orderId = normalizeString(row?.source_order_id)
    const vendorItemId = normalizeString(row?.extra_flags?.sourceProductId || row?.raw_json?.item?.vendorItemId)
    const key = buildRevenueOrderItemKey(orderId, vendorItemId)
    if (!key) continue

    const expectedSettlementAmount = toMoneyNumber(row?.raw_json?.computed?.expectedSettlementAmount)
    const commissionAmount = toMoneyNumber(row?.raw_json?.computed?.commissionAmount)
    const aggregate = aggregateMap.get(key)

    if (aggregate) {
      aggregate.expectedSettlementAmount = roundMoney(aggregate.expectedSettlementAmount + expectedSettlementAmount)
      aggregate.commissionAmount = roundMoney(aggregate.commissionAmount + commissionAmount)
      aggregate.rowCount += 1
      continue
    }

    aggregateMap.set(key, {
      orderId,
      sourceProductId: vendorItemId,
      expectedSettlementAmount: roundMoney(expectedSettlementAmount),
      commissionAmount: roundMoney(commissionAmount),
      rowCount: 1,
    })
  }

  return aggregateMap
}

export function buildRevenueSettlementPatches(input) {
  const purchaseRows = Array.isArray(input.purchaseRows) ? input.purchaseRows : []
  const aggregateMap = input.aggregateMap instanceof Map
    ? input.aggregateMap
    : aggregateRevenueEventRowsByOrderItem(input.eventRows)
  const patches = []
  const purchaseLookup = buildPurchaseLookupByRevenueKey(purchaseRows)

  for (const [key, rows] of purchaseLookup.entries()) {
    const aggregate = aggregateMap.get(key)
    if (!aggregate) continue

    const weights = rows.map((row) => {
      const quantity = Number(row?.quantity)
      return Number.isFinite(quantity) && quantity > 0 ? quantity : 1
    })
    const settlementAllocations = allocateAmountAcrossWeights(aggregate.expectedSettlementAmount, weights)
    const commissionAllocations = allocateAmountAcrossWeights(aggregate.commissionAmount, weights)

    rows.forEach((row, index) => {
      patches.push({
        purchase_id: row.purchase_id,
        expected_settlement_amount: settlementAllocations[index] ?? 0,
        payment_commission: commissionAllocations[index] ?? 0,
        sale_commission: 0,
      })
    })
  }

  return patches
}

export async function runCoupangRevenueEnrichment(input) {
  const recognitionWindow = resolveRevenueRecognitionWindow({
    recognitionFrom: input.recognitionFrom,
    recognitionTo: input.recognitionTo,
  })

  if (recognitionWindow.isEmpty) {
    return {
      recognitionFrom: recognitionWindow.recognitionFrom,
      recognitionTo: recognitionWindow.recognitionTo,
      revenueHistoryRecordCount: 0,
      matchedOrderCount: 0,
      revenueEventCount: 0,
      patchedPurchaseCount: 0,
    }
  }

  const recognitionTo = recognitionWindow.recognitionTo
  const revenueRecords = await fetchCoupangRevenueHistory(input.coupangConfig, input.requestState, {
    from: recognitionWindow.recognitionFrom,
    to: recognitionTo,
    maxPerPage: input.maxPerPage,
  })
  const orderIds = [...new Set(revenueRecords.map((record) => normalizeString(record?.orderId)).filter(Boolean))]
  const purchaseRows = input.targetConfig
    ? await fetchCoupangMarketplacePurchasesByOrderIds(input.targetConfig, input.accountKey, orderIds)
    : []
  const purchaseLookup = buildPurchaseLookupByRevenueKey(purchaseRows)
  const revenueEventRows = buildRevenueHistoryEventRows({
    records: revenueRecords,
    purchaseLookup,
    accountKey: input.accountKey,
    runId: input.runId,
  })

  if (!input.dryRun && input.targetConfig && revenueEventRows.length > 0) {
    await deleteRevenueEventRowsByOrderIdsInWindow(
      input.targetConfig,
      input.accountKey,
      orderIds,
      recognitionWindow.recognitionFrom,
      recognitionTo,
    )

    const persistedEventRows = revenueEventRows.map((row) =>
      maybeWithSourceFulfillmentType(row, input.sourceScopeSupport?.commerceOrderEventsRaw))
    await upsertRows(
      input.targetConfig,
      'commerce_order_events_raw',
      'source_channel,source_fulfillment_type,source_account_key,source_line_id,event_at,event_type',
      persistedEventRows,
    )
  }

  const affectedOrderIds = [...new Set(revenueEventRows.map((row) => normalizeString(row?.source_order_id)).filter(Boolean))]
  const cumulativeRevenueEvents = input.targetConfig
    ? await fetchCoupangRevenueEventRowsByOrderIds(input.targetConfig, input.accountKey, affectedOrderIds)
    : revenueEventRows
  const revenueAggregateMap = aggregateRevenueEventRowsByOrderItem(cumulativeRevenueEvents)
  const settlementPatches = buildRevenueSettlementPatches({
    purchaseRows,
    aggregateMap: revenueAggregateMap,
  })

  if (!input.dryRun && input.targetConfig && settlementPatches.length > 0) {
    await patchPurchaseAmountRows(input.targetConfig, settlementPatches)
  }

  return {
    recognitionFrom: recognitionWindow.recognitionFrom,
    recognitionTo,
    revenueHistoryRecordCount: revenueRecords.length,
    matchedOrderCount: affectedOrderIds.length,
    revenueEventCount: revenueEventRows.length,
    patchedPurchaseCount: settlementPatches.length,
  }
}

async function runMarketplaceScope(coupangConfig, requestState, args) {
  const orders = await fetchMarketplaceOrders(coupangConfig, requestState, args)
  const rawLineRows = dedupeCoupangRawLineRows(orders.flatMap((order) => buildCoupangMarketplaceRawLineRows({
    order,
    sourceAccountKey: args.accountKey,
  })))

  return {
    orders,
    rawLineRows,
  }
}

async function runRocketGrowthScope(coupangConfig, requestState, args) {
  const orders = await fetchRocketGrowthOrders(coupangConfig, requestState, args)
  const rawLineRows = dedupeCoupangRawLineRows(orders.flatMap((order) => buildCoupangRocketGrowthRawLineRows({
    order,
    sourceAccountKey: args.accountKey,
  })))

  return {
    orders,
    rawLineRows,
  }
}

function extractShipmentBoxIdFromRawLine(row) {
  return normalizeString(row?.raw_json?.order?.shipmentBoxId)
}

function extractOrderIdFromRawLine(row) {
  return normalizeString(row?.source_order_id || row?.raw_json?.order?.orderId)
}

function extractVendorItemIdFromRawLine(row) {
  return normalizeString(row?.source_product_id || row?.raw_json?.item?.vendorItemId)
}

function buildMarketplaceSignalMatchKeys(input) {
  const shipmentBoxId = normalizeString(input?.shipmentBoxId)
  const orderId = normalizeString(input?.orderId)
  const vendorItemId = normalizeString(input?.vendorItemId)
  const keys = []

  if (shipmentBoxId && vendorItemId) {
    keys.push(`shipment:${shipmentBoxId}:${vendorItemId}`)
  }
  if (orderId && vendorItemId) {
    keys.push(`order:${orderId}:${vendorItemId}`)
  }

  return keys
}

function buildMarketplaceClaimLookup(claimRequests) {
  const lookup = new Map()

  for (const claim of Array.isArray(claimRequests) ? claimRequests : []) {
    const keys = buildMarketplaceSignalMatchKeys({
      shipmentBoxId: claim?.shipmentBoxId,
      orderId: claim?.orderId,
      vendorItemId: claim?.vendorItemId,
    })
    const claimAt = Date.parse(
      normalizeString(claim?.modifiedAt)
      || normalizeString(claim?.createdAt)
      || '1970-01-01T00:00:00.000Z',
    )

    for (const key of keys) {
      const existing = lookup.get(key)
      const existingAt = Date.parse(
        normalizeString(existing?.modifiedAt)
        || normalizeString(existing?.createdAt)
        || '1970-01-01T00:00:00.000Z',
      )
      if (!existing || claimAt >= existingAt) {
        lookup.set(key, claim)
      }
    }
  }

  return lookup
}

function buildMarketplaceShipmentHistoryLookup(entries) {
  const lookup = new Map()

  for (const [shipmentBoxId, historyRows] of entries) {
    const rows = Array.isArray(historyRows) ? [...historyRows] : []
    rows.sort((left, right) => {
      const leftAt = Date.parse(normalizeString(left?.updatedAt) || '1970-01-01T00:00:00.000Z')
      const rightAt = Date.parse(normalizeString(right?.updatedAt) || '1970-01-01T00:00:00.000Z')
      return leftAt - rightAt
    })
    lookup.set(String(shipmentBoxId), rows)
  }

  return lookup
}

function dedupeEventRows(rows) {
  const dedupedMap = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = [
      row?.source_channel,
      row?.source_fulfillment_type,
      row?.source_account_key,
      row?.source_line_id,
      row?.event_at,
      row?.event_type,
    ].map((value) => normalizeString(value)).join('::')
    if (!key) continue
    dedupedMap.set(key, row)
  }

  return Array.from(dedupedMap.values())
}

function enrichMarketplaceRawLineRows(input) {
  const claimLookup = buildMarketplaceClaimLookup(input.claimRequests)
  const historyLookup = buildMarketplaceShipmentHistoryLookup(input.shipmentHistoryEntries)
  const eventRows = []

  const rows = (Array.isArray(input.rawLineRows) ? input.rawLineRows : []).map((row) => {
    const shipmentBoxId = extractShipmentBoxIdFromRawLine(row)
    const orderId = extractOrderIdFromRawLine(row)
    const vendorItemId = extractVendorItemIdFromRawLine(row)
    const matchKeys = buildMarketplaceSignalMatchKeys({ shipmentBoxId, orderId, vendorItemId })
    const claim = matchKeys.map((key) => claimLookup.get(key)).find(Boolean) || null
    const historyRows = shipmentBoxId ? (historyLookup.get(shipmentBoxId) || []) : []
    const latestHistory = historyRows[historyRows.length - 1] || null

    if (claim) {
      const claimEventAt = normalizeString(claim.modifiedAt || claim.createdAt)
      if (claimEventAt) {
        eventRows.push({
          source_channel: 'coupang',
          source_fulfillment_type: COUPANG_MARKETPLACE_FULFILLMENT_TYPE,
          source_account_key: input.sourceAccountKey,
          run_id: input.runId,
          window_id: null,
          source_order_id: row.source_order_id,
          source_line_id: row.source_line_id,
          event_type: `claim:${normalizeString(claim.receiptType || 'unknown')}:${normalizeString(claim.receiptStatus || 'unknown')}`,
          event_at: claimEventAt,
          order_status: row.product_order_status,
          payment_date: row.payment_date,
          extra_flags: {
            receiptType: claim.receiptType || null,
            receiptStatus: claim.receiptStatus || null,
            requesterName: claim.requesterName || null,
          },
          raw_json: claim,
        })
      }
    }

    for (const history of historyRows) {
      const historyEventAt = normalizeString(history?.updatedAt)
      if (!historyEventAt) continue
      eventRows.push({
        source_channel: 'coupang',
        source_fulfillment_type: COUPANG_MARKETPLACE_FULFILLMENT_TYPE,
        source_account_key: input.sourceAccountKey,
        run_id: input.runId,
        window_id: null,
        source_order_id: row.source_order_id,
        source_line_id: row.source_line_id,
        event_type: `delivery:${normalizeString(history?.deliveryStatus || history?.deliveryStatusDesc || 'unknown')}`,
        event_at: historyEventAt,
        order_status: normalizeString(history?.deliveryStatus) || row.product_order_status,
        payment_date: row.payment_date,
        extra_flags: {
          deliveryStatusDesc: history?.deliveryStatusDesc || null,
        },
        raw_json: history,
      })
    }

    return {
      ...row,
      claim_status: normalizeString(claim?.receiptStatus) || row.claim_status,
      last_event_type: normalizeString(latestHistory?.deliveryStatus)
        || normalizeString(claim?.receiptType)
        || row.last_event_type,
      last_event_at: normalizeString(latestHistory?.updatedAt)
        || normalizeString(claim?.modifiedAt)
        || normalizeString(claim?.createdAt)
        || row.last_event_at,
      raw_json: {
        ...row.raw_json,
        ...(claim ? { claim_request: claim } : {}),
        ...(historyRows.length > 0 ? { delivery_history: historyRows } : {}),
      },
    }
  })

  return {
    rawLineRows: dedupeCoupangRawLineRows(rows),
    eventRows: dedupeEventRows(eventRows),
  }
}

async function fetchMarketplaceClaimRequests(coupangConfig, requestState, args) {
  const claimRequests = []
  const days = enumerateIsoDateRange(args.from, args.to)

  for (const day of days) {
    for (const status of MARKETPLACE_RETURN_REQUEST_STATUSES) {
      let nextToken = '1'

      while (nextToken) {
        const currentToken = nextToken
        const payload = await coupangRequestJson(coupangConfig, requestState, {
          method: 'GET',
          path: `/v2/providers/openapi/apis/api/v6/vendors/${coupangConfig.vendorId}/returnRequests`,
          params: {
            createdAtFrom: toMarketplaceClaimDate(day),
            createdAtTo: toMarketplaceClaimDate(day),
            status,
            maxPerPage: String(args.maxPerPage),
            nextToken,
          },
        })

        const rows = Array.isArray(payload?.data) ? payload.data : []
        claimRequests.push(...rows)
        nextToken = normalizeString(payload?.nextToken)
        if (!nextToken || nextToken === currentToken || rows.length === 0) {
          break
        }
      }
    }

    let cancelNextToken = '1'

    while (cancelNextToken) {
      const currentToken = cancelNextToken
      const payload = await coupangRequestJson(coupangConfig, requestState, {
        method: 'GET',
        path: `/v2/providers/openapi/apis/api/v6/vendors/${coupangConfig.vendorId}/returnRequests`,
        params: {
          createdAtFrom: toMarketplaceClaimDate(day),
          createdAtTo: toMarketplaceClaimDate(day),
          cancelType: 'CANCEL',
          maxPerPage: String(args.maxPerPage),
          nextToken: cancelNextToken,
        },
      })

      const rows = Array.isArray(payload?.data) ? payload.data : []
      claimRequests.push(...rows)
      cancelNextToken = normalizeString(payload?.nextToken)
      if (!cancelNextToken || cancelNextToken === currentToken || rows.length === 0) {
        break
      }
    }
  }

  return claimRequests
}

async function fetchMarketplaceShipmentHistories(coupangConfig, requestState, rawLineRows) {
  const shipmentBoxIds = [...new Set(
    (Array.isArray(rawLineRows) ? rawLineRows : [])
      .map((row) => extractShipmentBoxIdFromRawLine(row))
      .filter(Boolean),
  )]

  const entries = []

  for (const shipmentBoxId of shipmentBoxIds) {
    const payload = await coupangRequestJson(coupangConfig, requestState, {
      method: 'GET',
      path: `/v2/providers/openapi/apis/api/v5/vendors/${coupangConfig.vendorId}/ordersheets/${shipmentBoxId}/history`,
    })

    entries.push([
      shipmentBoxId,
      Array.isArray(payload?.data)
        ? payload.data
        : (Array.isArray(payload) ? payload : []),
    ])
  }

  return entries
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  validateDateInput(args.from, 'from')
  validateDateInput(args.to, 'to')
  if (args.from > args.to) {
    throw new Error('to must be greater than or equal to from')
  }

  const env = await parseEnvFile(args.envPath)
  const coupangConfig = buildCoupangConfig(env)
  const fulfillmentTypes = buildSelectedFulfillmentTypes(args.fulfillmentType)
  coupangConfig.requestIntervalMs = Number.isFinite(args.requestIntervalMs) && args.requestIntervalMs > 0
    ? args.requestIntervalMs
    : coupangConfig.requestIntervalMs
  coupangConfig.maxRetries = Number.isFinite(args.maxRetries) && args.maxRetries > 0
    ? args.maxRetries
    : coupangConfig.maxRetries
  coupangConfig.retryBaseDelayMs = Number.isFinite(args.retryBaseDelayMs) && args.retryBaseDelayMs > 0
    ? args.retryBaseDelayMs
    : coupangConfig.retryBaseDelayMs
  const requestState = { lastRequestAt: 0 }

  console.log(`[coupang-sync] target range ${args.from} -> ${args.to}`)
  console.log(`[coupang-sync] fulfillment ${fulfillmentTypes.join(', ')}`)

  const hasTargetConfig = Boolean(
    normalizeString(env.NUXT_PUBLIC_SUPABASE_URL)
    && normalizeString(env.SUPABASE_SERVICE_KEY),
  )
  const targetConfig = hasTargetConfig
    ? buildClientConfig(env, 'target')
    : null
  const sourceScopeSupport = targetConfig
    ? await detectSourceScopeSupport(targetConfig)
    : {
        commerceSyncRuns: false,
        commerceSyncCursors: false,
        commerceOrderEventsRaw: false,
        commerceOrderLinesRaw: false,
        commerceProductMappings: false,
    purchases: false,
        purchaseAmounts: false,
      }

  if (!args.dryRun) {
    if (!targetConfig) {
      throw new Error('Coupang live sync requires target Supabase configuration')
    }
    assertLiveSchemaSupport(sourceScopeSupport)
  }

  const products = targetConfig ? await fetchActiveProducts(targetConfig) : []
  const productLookup = buildCoupangProductLookupFromRows(products)
  const productMappings = targetConfig
    ? await fetchCommerceProductMappings(targetConfig, args.accountKey, sourceScopeSupport)
    : []
  const productMappingLookup = buildCoupangCommerceProductMappingLookupFromRows(productMappings)

  if (targetConfig && !sourceScopeSupport.purchaseAmounts) {
    console.warn('[coupang-sync] purchases.payment_amount column is missing. Apply 107_extend_purchases_amount_columns.sql to persist revenue fields.')
  }

  const summary = {
    dryRun: args.dryRun,
    sourceChannel: 'coupang',
    sourceAccountKey: args.accountKey,
    requestedFrom: args.from,
    requestedTo: args.to,
    dateBasisLabel: fulfillmentTypes.length === 1
      ? describeCoupangDateBasis(fulfillmentTypes[0]).label
      : describeCoupangDateBasis('all').label,
    selectedFulfillmentTypes: fulfillmentTypes,
    responseOrderCount: 0,
    fetchedOrderCount: 0,
    rawEventCount: 0,
    rawLineCount: 0,
    projectedCount: 0,
    excludedCount: 0,
    unresolvedCount: 0,
    deletedCount: 0,
    persistedRawEventCount: 0,
    persistedRawLineCount: 0,
    persistedPurchaseCount: 0,
    revenueRecognitionFrom: args.from,
    revenueRecognitionTo: currentLocalYesterdayIsoDate(),
    revenueHistoryRecordCount: 0,
    revenueMatchedOrderCount: 0,
    revenueEventCount: 0,
    revenuePatchedPurchaseCount: 0,
    scopeSummaries: [],
  }
  let revenueOnlyRunId = null

  if (!args.dryRun && args.revenueOnly) {
    const revenueRunRow = await createSyncRun(
      targetConfig,
      args,
      args.from,
      maxIsoDate(args.to, currentLocalYesterdayIsoDate()),
      COUPANG_MARKETPLACE_FULFILLMENT_TYPE,
    )
    revenueOnlyRunId = String(revenueRunRow.id)
  }

  for (const fulfillmentType of fulfillmentTypes) {
    if (args.revenueOnly) break

    const scopeSummary = createScopeSummary(fulfillmentType)
    let runId = args.dryRun ? randomUUID() : null

    try {
      if (!args.dryRun) {
        const runRow = await createSyncRun(targetConfig, args, args.from, args.to, fulfillmentType)
        runId = String(runRow.id)
        scopeSummary.runId = runId
      }

      const result = fulfillmentType === COUPANG_MARKETPLACE_FULFILLMENT_TYPE
        ? await runMarketplaceScope(coupangConfig, requestState, args)
        : await runRocketGrowthScope(coupangConfig, requestState, args)
      let rawLineRows = result.rawLineRows
      let eventRows = []

      if (fulfillmentType === COUPANG_MARKETPLACE_FULFILLMENT_TYPE && rawLineRows.length > 0) {
        try {
          const claimRequests = await fetchMarketplaceClaimRequests(coupangConfig, requestState, args)
          const shipmentHistoryEntries = await fetchMarketplaceShipmentHistories(coupangConfig, requestState, rawLineRows)

          const enriched = enrichMarketplaceRawLineRows({
            rawLineRows,
            claimRequests,
            shipmentHistoryEntries,
            runId,
            sourceAccountKey: args.accountKey,
          })

          rawLineRows = enriched.rawLineRows
          eventRows = enriched.eventRows

          console.log(
            `[coupang-sync] scope=${fulfillmentType} claims=${claimRequests.length} shipmentHistories=${shipmentHistoryEntries.length} rawEvents=${eventRows.length}`,
          )
        } catch (error) {
          console.warn(
            `[coupang-sync] scope=${fulfillmentType} signal enrichment skipped: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      scopeSummary.responseOrderCount = result.orders.length
      scopeSummary.fetchedOrderCount = countUniqueCoupangOrders(result.orders, fulfillmentType)
      scopeSummary.rawEventCount = eventRows.length
      scopeSummary.rawLineCount = rawLineRows.length
      const records = rawLineRows.map((rawLine) => resolveCoupangSyncRecord({
        rawLine,
        productLookup,
        productMappingLookup,
        runId,
      }))
      const purchaseRows = records
        .filter((record) => record.purchase)
        .map((record) => record.purchase)
      const excludedIds = records
        .filter((record) => !record.eligible)
        .map((record) => record.rawLine.source_line_id)
      const unresolvedRecords = records.filter((record) => record.eligible && !record.purchase)
      const unresolvedIds = unresolvedRecords.map((record) => record.rawLine.source_line_id)
      const deletedPurchaseIds = [...new Set([...excludedIds, ...unresolvedIds])]

      scopeSummary.projectedCount = purchaseRows.length
      scopeSummary.excludedCount = excludedIds.length
      scopeSummary.unresolvedCount = unresolvedRecords.length
      scopeSummary.deletedCount = deletedPurchaseIds.length
      summary.responseOrderCount += result.orders.length
      summary.fetchedOrderCount += scopeSummary.fetchedOrderCount
      summary.rawEventCount += eventRows.length
      summary.rawLineCount += rawLineRows.length
      summary.projectedCount += purchaseRows.length
      summary.excludedCount += excludedIds.length
      summary.unresolvedCount += unresolvedRecords.length
      summary.deletedCount += deletedPurchaseIds.length

      console.log(
        `[coupang-sync] scope=${fulfillmentType} responseOrders=${scopeSummary.responseOrderCount} uniqueOrders=${scopeSummary.fetchedOrderCount} rawEvents=${eventRows.length} rawLines=${rawLineRows.length} projected=${purchaseRows.length} excluded=${excludedIds.length} unresolved=${unresolvedRecords.length} dateBasis=${scopeSummary.dateBasisLabel}`,
      )

      if (!args.dryRun) {
        const persistedEventRows = eventRows.map((row) =>
          maybeWithSourceFulfillmentType(row, sourceScopeSupport.commerceOrderEventsRaw))
        const persistedPurchaseRows = purchaseRows.map((row) =>
          maybeWithPurchaseAmountColumns(
            maybeWithSourceFulfillmentType(row, sourceScopeSupport.purchases),
            sourceScopeSupport.purchaseAmounts,
          ))

        await upsertRows(
          targetConfig,
          'commerce_order_events_raw',
          'source_channel,source_fulfillment_type,source_account_key,source_line_id,event_at,event_type',
          persistedEventRows,
        )
        await upsertRows(
          targetConfig,
          'commerce_order_lines_raw',
          'source_channel,source_fulfillment_type,source_account_key,source_line_id',
          rawLineRows,
        )
        await upsertRows(targetConfig, 'purchases', 'purchase_id', persistedPurchaseRows)
        await deleteProjectedPurchases(targetConfig, deletedPurchaseIds, args.accountKey, sourceScopeSupport)
        await updateCursor(targetConfig, args, runId, args.from, args.to, fulfillmentType)
        scopeSummary.persistedRawEventCount = persistedEventRows.length
        scopeSummary.persistedRawLineCount = rawLineRows.length
        scopeSummary.persistedPurchaseCount = persistedPurchaseRows.length
        summary.persistedRawEventCount += persistedEventRows.length
        summary.persistedRawLineCount += rawLineRows.length
        summary.persistedPurchaseCount += persistedPurchaseRows.length

        await updateSyncRun(targetConfig, runId, buildSummaryPatch(scopeSummary, 'done'))
        console.log(`[coupang-sync] scope=${fulfillmentType} persisted rawEvents=${persistedEventRows.length} rawLines=${rawLineRows.length} projected=${persistedPurchaseRows.length} runId=${runId}`)
      }
    } catch (error) {
      if (!args.dryRun && runId) {
        await updateSyncRun(
          targetConfig,
          runId,
          buildSummaryPatch(scopeSummary, 'failed', error instanceof Error ? error.message : String(error)),
        )
      }
      throw error
    } finally {
      summary.scopeSummaries.push(scopeSummary)
    }
  }

  const revenueRunId = summary.scopeSummaries.find((scope) => normalizeString(scope.runId))?.runId || revenueOnlyRunId

  try {
    const revenueSummary = await runCoupangRevenueEnrichment({
      coupangConfig,
      requestState,
      targetConfig,
      sourceScopeSupport,
      accountKey: args.accountKey,
      runId: revenueRunId,
      recognitionFrom: args.from,
      // Revenue recognition/settlement is often recorded after the order window closes.
      // For historical backfills, continue querying through the latest completed local day
      // so existing marketplace orders can be patched with delayed settlement data.
      recognitionTo: maxIsoDate(args.to, currentLocalIsoDate()),
      maxPerPage: args.maxPerPage,
      dryRun: args.dryRun,
    })

    summary.revenueRecognitionFrom = revenueSummary.recognitionFrom
    summary.revenueRecognitionTo = revenueSummary.recognitionTo
    summary.revenueHistoryRecordCount = revenueSummary.revenueHistoryRecordCount
    summary.revenueMatchedOrderCount = revenueSummary.matchedOrderCount
    summary.revenueEventCount = revenueSummary.revenueEventCount
    summary.revenuePatchedPurchaseCount = revenueSummary.patchedPurchaseCount

    if (!args.dryRun && revenueOnlyRunId) {
      await updateSyncRun(targetConfig, revenueOnlyRunId, buildSummaryPatch({
        ...createScopeSummary(COUPANG_MARKETPLACE_FULFILLMENT_TYPE),
        runId: revenueOnlyRunId,
        responseOrderCount: 0,
        fetchedOrderCount: revenueSummary.matchedOrderCount,
        rawEventCount: revenueSummary.revenueEventCount,
        persistedRawEventCount: revenueSummary.revenueEventCount,
        persistedPurchaseCount: revenueSummary.patchedPurchaseCount,
        projectedCount: revenueSummary.patchedPurchaseCount,
      }, 'done'))
    }
  } catch (error) {
    if (!args.dryRun && revenueOnlyRunId) {
      await updateSyncRun(
        targetConfig,
        revenueOnlyRunId,
        buildSummaryPatch(
          {
            ...createScopeSummary(COUPANG_MARKETPLACE_FULFILLMENT_TYPE),
            runId: revenueOnlyRunId,
          },
          'failed',
          error instanceof Error ? error.message : String(error),
        ),
      )
    }
    throw error
  }

  console.log(JSON.stringify(summary, null, 2))
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

export {
  buildMarketplaceClaimLookup,
  buildMarketplaceSignalMatchKeys,
  buildMarketplaceShipmentHistoryLookup,
  enrichMarketplaceRawLineRows,
  parseArgs,
}
