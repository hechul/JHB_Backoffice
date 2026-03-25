import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import { resolve } from 'node:path'

import {
  buildCommerceProductMappingLookupFromRows,
  buildChangedStatusEventRow,
  buildProductLookupFromRows,
  extractNaverChangedStatusItems,
  extractNaverChangedStatusPagination,
  extractNaverProductOrderInfos,
  formatNaverDateTime,
  parseNaverSyncDateTime,
  resolveNaverSyncRecord,
  splitNaverSyncWindows,
} from '../server/utils/commerce/naver-sync.ts'
import {
  buildClientConfig,
  chunk,
  parseEnvFile,
  restRequest,
} from './sync-master-data.mjs'

const DEFAULT_ENV = resolve(process.cwd(), '.env')
const DEFAULT_API_BASE_URL = 'https://api.commerce.naver.com/external/v1'
const DEFAULT_LIMIT_COUNT = 300
const DEFAULT_DETAIL_BATCH_SIZE = 300
const DEFAULT_REQUEST_INTERVAL_MS = 1200
const DEFAULT_MAX_RETRIES = 5
const DEFAULT_RETRY_BASE_DELAY_MS = 10000
const AUTH_HELPER_PATH = resolve(process.cwd(), 'scripts', 'lib', 'naver-commerce-auth.py')

function printHelp() {
  console.log(`
Usage:
  node scripts/sync-naver-orders.mjs --from=2026-03-01 --to=2026-03-03

Options:
  --from=VALUE                  Sync start. Supports YYYY-MM-DD or ISO date-time
  --to=VALUE                    Sync end. Supports YYYY-MM-DD or ISO date-time
  --env=PATH                    Env file path (default: ./.env)
  --account-key=VALUE           Source account key (default: default)
  --run-type=VALUE              manual_sync | backfill | incremental (default: manual_sync)
  --requested-by-account-id=ID  Optional profiles.id for audit
  --limit-count=NUMBER          Changed-status page size (default: 300)
  --detail-batch-size=NUMBER    Product-order detail batch size (default: 300)
  --request-interval-ms=NUMBER  Minimum delay between Naver API requests (default: 1200)
  --max-retries=NUMBER          Retry count for transient/429 errors (default: 5)
  --retry-base-delay-ms=NUMBER  Base retry delay in milliseconds (default: 10000)
  --dry-run                     Fetch and transform without DB writes
  --help                        Show this help
`.trim())
}

function parseArgs(argv) {
  const args = {
    envPath: DEFAULT_ENV,
    from: '',
    to: '',
    accountKey: 'default',
    runType: 'manual_sync',
    requestedByAccountId: null,
    limitCount: DEFAULT_LIMIT_COUNT,
    detailBatchSize: DEFAULT_DETAIL_BATCH_SIZE,
    requestIntervalMs: DEFAULT_REQUEST_INTERVAL_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
    retryBaseDelayMs: DEFAULT_RETRY_BASE_DELAY_MS,
    dryRun: false,
    help: false,
  }

  for (const rawArg of argv) {
    if (rawArg === '--dry-run') {
      args.dryRun = true
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
      args.from = rawArg.slice('--from='.length).trim()
      continue
    }
    if (rawArg.startsWith('--to=')) {
      args.to = rawArg.slice('--to='.length).trim()
      continue
    }
    if (rawArg.startsWith('--account-key=')) {
      args.accountKey = rawArg.slice('--account-key='.length).trim() || 'default'
      continue
    }
    if (rawArg.startsWith('--run-type=')) {
      args.runType = rawArg.slice('--run-type='.length).trim() || 'manual_sync'
      continue
    }
    if (rawArg.startsWith('--requested-by-account-id=')) {
      const value = rawArg.slice('--requested-by-account-id='.length).trim()
      args.requestedByAccountId = value || null
      continue
    }
    if (rawArg.startsWith('--limit-count=')) {
      args.limitCount = Number.parseInt(rawArg.slice('--limit-count='.length), 10) || DEFAULT_LIMIT_COUNT
      continue
    }
    if (rawArg.startsWith('--detail-batch-size=')) {
      args.detailBatchSize = Number.parseInt(rawArg.slice('--detail-batch-size='.length), 10) || DEFAULT_DETAIL_BATCH_SIZE
      continue
    }
    if (rawArg.startsWith('--request-interval-ms=')) {
      args.requestIntervalMs = Number.parseInt(rawArg.slice('--request-interval-ms='.length), 10) || DEFAULT_REQUEST_INTERVAL_MS
      continue
    }
    if (rawArg.startsWith('--max-retries=')) {
      args.maxRetries = Number.parseInt(rawArg.slice('--max-retries='.length), 10) || DEFAULT_MAX_RETRIES
      continue
    }
    if (rawArg.startsWith('--retry-base-delay-ms=')) {
      args.retryBaseDelayMs = Number.parseInt(rawArg.slice('--retry-base-delay-ms='.length), 10) || DEFAULT_RETRY_BASE_DELAY_MS
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

  return args
}

function buildNaverConfig(env) {
  const clientId = String(env.NAVER_COMMERCE_CLIENT_ID || '').trim()
  const clientSecret = String(env.NAVER_COMMERCE_CLIENT_SECRET || '').trim()
  const apiBaseUrl = String(env.NAVER_COMMERCE_API_BASE_URL || DEFAULT_API_BASE_URL).trim()
  const tokenType = String(env.NAVER_COMMERCE_TOKEN_TYPE || 'SELF').trim().toUpperCase()
  const accountId = String(env.NAVER_COMMERCE_ACCOUNT_ID || '').trim()
  const accessToken = String(env.NAVER_COMMERCE_ACCESS_TOKEN || '').trim()
  const requestIntervalMs = Number.parseInt(String(env.NAVER_COMMERCE_REQUEST_INTERVAL_MS || ''), 10) || DEFAULT_REQUEST_INTERVAL_MS
  const maxRetries = Number.parseInt(String(env.NAVER_COMMERCE_MAX_RETRIES || ''), 10) || DEFAULT_MAX_RETRIES
  const retryBaseDelayMs = Number.parseInt(String(env.NAVER_COMMERCE_RETRY_BASE_DELAY_MS || ''), 10) || DEFAULT_RETRY_BASE_DELAY_MS

  if (!accessToken && (!clientId || !clientSecret)) {
    throw new Error('NAVER_COMMERCE_CLIENT_ID and NAVER_COMMERCE_CLIENT_SECRET are required unless NAVER_COMMERCE_ACCESS_TOKEN is set')
  }

  return {
    clientId,
    clientSecret,
    apiBaseUrl,
    tokenType,
    accountId: accountId || null,
    accessToken: accessToken || null,
    requestIntervalMs,
    maxRetries,
    retryBaseDelayMs,
  }
}

function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve()
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms)
  })
}

function extractRetryAfterMs(response) {
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

function computeRetryDelayMs(response, attempt, naverConfig) {
  const retryAfterMs = extractRetryAfterMs(response)
  if (retryAfterMs) {
    return retryAfterMs
  }

  const baseDelayMs = response.status === 429
    ? Math.max(naverConfig.retryBaseDelayMs, 10000)
    : Math.max(Math.floor(naverConfig.retryBaseDelayMs / 2), 2000)

  const exponentialDelayMs = baseDelayMs * (2 ** attempt)
  return Math.min(exponentialDelayMs, 120000)
}

function signNaverClientSecret(naverConfig) {
  const timestamp = String(Date.now())
  const result = spawnSync('python3', [AUTH_HELPER_PATH, timestamp], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NAVER_COMMERCE_CLIENT_ID: naverConfig.clientId,
      NAVER_COMMERCE_CLIENT_SECRET: naverConfig.clientSecret,
    },
  })

  if (result.status !== 0) {
    const stderr = (result.stderr || result.stdout || '').trim()
    throw new Error(`Failed to generate Naver client_secret_sign: ${stderr || `exit ${result.status}`}`)
  }

  return JSON.parse(result.stdout)
}

async function fetchNaverAccessToken(naverConfig) {
  if (naverConfig.accessToken) {
    return naverConfig.accessToken
  }

  const signed = signNaverClientSecret(naverConfig)
  const body = new URLSearchParams({
    client_id: signed.client_id,
    timestamp: signed.timestamp,
    grant_type: 'client_credentials',
    client_secret_sign: signed.client_secret_sign,
    type: naverConfig.tokenType,
  })
  if (naverConfig.accountId && naverConfig.tokenType === 'SELLER') {
    body.set('account_id', naverConfig.accountId)
  }

  const response = await fetch(`${naverConfig.apiBaseUrl}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    const bodyText = await response.text()
    throw new Error(`Naver token request failed: ${response.status} ${response.statusText} ${bodyText}`)
  }

  const payload = await response.json()
  if (!payload?.access_token) {
    throw new Error('Naver token response does not contain access_token')
  }

  return String(payload.access_token)
}

async function naverApiRequest(naverConfig, requestState, accessToken, path, init = {}) {
  let attempt = 0

  while (true) {
    const waitMs = Math.max(0, requestState.lastRequestAt + naverConfig.requestIntervalMs - Date.now())
    if (waitMs > 0) {
      await sleep(waitMs)
    }
    requestState.lastRequestAt = Date.now()

    const response = await fetch(`${naverConfig.apiBaseUrl}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    })

    if (response.ok) {
      return response.json()
    }

    const bodyText = await response.text()
    const canRetry = (response.status === 429 || response.status >= 500) && attempt < naverConfig.maxRetries

    if (canRetry) {
      const delayMs = computeRetryDelayMs(response, attempt, naverConfig)
      console.warn(
        `[naver-sync] retry ${attempt + 1}/${naverConfig.maxRetries} for ${path} after ${delayMs}ms (${response.status} ${response.statusText})`,
      )
      attempt += 1
      await sleep(delayMs)
      continue
    }

    throw new Error(`Naver API request failed: ${response.status} ${response.statusText} ${bodyText}`)
  }
}

async function fetchChangedStatusesForWindow(naverConfig, requestState, accessToken, window, limitCount) {
  const allItems = []
  const pages = []
  let nextFrom = window.windowFrom
  let nextSequence = null

  while (true) {
    const query = new URLSearchParams({
      lastChangedFrom: nextFrom,
      lastChangedTo: window.windowTo,
      limitCount: String(limitCount),
    })
    if (nextSequence) {
      query.set('moreSequence', nextSequence)
    }

    const payload = await naverApiRequest(
      naverConfig,
      requestState,
      accessToken,
      `pay-order/seller/product-orders/last-changed-statuses?${query.toString()}`,
      { method: 'GET' },
    )

    const items = extractNaverChangedStatusItems(payload)
    allItems.push(...items)

    const more = extractNaverChangedStatusPagination(payload)
    pages.push({
      requestFrom: nextFrom,
      requestTo: window.windowTo,
      itemCount: items.length,
      moreFrom: more.moreFrom,
      moreSequence: more.moreSequence,
    })

    if (!more.moreFrom || !more.moreSequence) {
      break
    }

    nextFrom = more.moreFrom
    nextSequence = more.moreSequence
  }

  return { items: allItems, pages }
}

async function fetchProductOrderDetails(naverConfig, requestState, accessToken, productOrderIds, detailBatchSize) {
  const allInfos = []

  for (const batch of chunk(productOrderIds, detailBatchSize)) {
    const payload = await naverApiRequest(
      naverConfig,
      requestState,
      accessToken,
      'pay-order/seller/product-orders/query',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productOrderIds: batch,
          quantityClaimCompatibility: true,
        }),
      },
    )

    allInfos.push(...extractNaverProductOrderInfos(payload))
  }

  return allInfos
}

async function fetchActiveProducts(targetConfig) {
  const query = 'products?select=product_id,product_name,option_name&deleted_at=is.null&order=product_name.asc'
  const rows = await restRequest(targetConfig, query, { method: 'GET' })
  return Array.isArray(rows) ? rows : []
}

async function fetchCommerceProductMappings(targetConfig, accountKey) {
  const normalizedAccountKey = String(accountKey || 'default').trim() || 'default'
  const query = [
    'commerce_product_mappings?select=id,source_channel,source_account_key,commerce_product_id,commerce_option_code,commerce_product_name,commerce_option_name,internal_product_id,matching_mode,canonical_variant,rule_json,priority,is_active',
    'source_channel=eq.naver',
    'is_active=is.true',
    `or=${encodeURIComponent(`(source_account_key.eq.default,source_account_key.eq.${normalizedAccountKey})`)}`,
    'order=priority.asc,id.asc',
  ].join('&')

  const rows = await restRequest(targetConfig, query, { method: 'GET' })
  return Array.isArray(rows) ? rows : []
}

async function createSyncRun(targetConfig, args, requestedFrom, requestedTo) {
  const rows = await restRequest(targetConfig, 'commerce_sync_runs', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify([{
      source_channel: 'naver',
      source_account_key: args.accountKey,
      run_type: args.runType,
      requested_by_account_id: args.requestedByAccountId,
      requested_from: requestedFrom,
      requested_to: requestedTo,
      status: 'running',
      summary_json: { dryRun: false },
    }]),
  })

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Failed to create commerce_sync_runs row')
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

async function createSyncWindow(targetConfig, runId, window) {
  const rows = await restRequest(targetConfig, 'commerce_sync_windows', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify([{
      run_id: runId,
      window_from: window.windowFrom,
      window_to: window.windowTo,
      status: 'running',
    }]),
  })

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Failed to create commerce_sync_windows row')
  }

  return rows[0]
}

async function updateSyncWindow(targetConfig, windowId, patch) {
  await restRequest(targetConfig, `commerce_sync_windows?id=eq.${windowId}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  })
}

async function upsertRows(targetConfig, table, conflictColumns, rows) {
  if (rows.length === 0) return

  for (const batch of chunk(rows, 500)) {
    await restRequest(
      targetConfig,
      `${table}?on_conflict=${encodeURIComponent(conflictColumns)}`,
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(batch),
      },
    )
  }
}

async function deleteProjectedPurchases(targetConfig, purchaseIds, accountKey) {
  if (purchaseIds.length === 0) return

  for (const batch of chunk(purchaseIds, 200)) {
    const encodedIds = batch.map((id) => `"${id}"`).join(',')
    const query = [
      `purchase_id=in.(${encodedIds})`,
      'source_channel=eq.naver',
      `source_account_key=eq.${encodeURIComponent(accountKey)}`,
    ].join('&')
    await restRequest(targetConfig, `purchases?${query}`, {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal',
      },
    })
  }
}

async function updateCursor(targetConfig, args, runId, requestedFrom, requestedTo, lastChangedAt) {
  await restRequest(
    targetConfig,
    'commerce_sync_cursors?on_conflict=source_channel,source_account_key',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([{
        source_channel: 'naver',
        source_account_key: args.accountKey,
        last_success_from: requestedFrom,
        last_success_to: requestedTo,
        last_success_changed_at: lastChangedAt,
        last_run_id: runId,
        updated_at: new Date().toISOString(),
      }]),
    },
  )
}

function pickLatestEventByLine(items) {
  const map = new Map()
  for (const item of items) {
    const key = String(item.productOrderId || '').trim()
    if (!key) continue
    const existing = map.get(key)
    if (!existing) {
      map.set(key, item)
      continue
    }
    const currentAt = String(item.lastChangedDate || '')
    const existingAt = String(existing.lastChangedDate || '')
    if (currentAt >= existingAt) {
      map.set(key, item)
    }
  }
  return map
}

function buildSummaryPatch(summary, status, errorMessage = null) {
  return {
    status,
    completed_at: new Date().toISOString(),
    summary_json: summary,
    error_message: errorMessage,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const env = await parseEnvFile(args.envPath)
  const targetConfig = buildClientConfig(env, 'target')
  const naverConfig = buildNaverConfig(env)
  const requestedFromDate = parseNaverSyncDateTime(args.from, 'start')
  const requestedToDate = parseNaverSyncDateTime(args.to, 'end')
  const requestedFrom = formatNaverDateTime(requestedFromDate)
  const requestedTo = formatNaverDateTime(requestedToDate)
  const windows = splitNaverSyncWindows(requestedFromDate, requestedToDate)

  console.log(`[naver-sync] target range ${requestedFrom} -> ${requestedTo}`)
  console.log(`[naver-sync] windows ${windows.length}`)

  const accessToken = await fetchNaverAccessToken(naverConfig)
  const requestState = { lastRequestAt: 0 }
  const products = await fetchActiveProducts(targetConfig)
  const productMappings = await fetchCommerceProductMappings(targetConfig, args.accountKey)
  const productLookup = buildProductLookupFromRows(products)
  const productMappingLookup = buildCommerceProductMappingLookupFromRows(productMappings)

  const runId = args.dryRun ? crypto.randomUUID() : String((await createSyncRun(targetConfig, args, requestedFrom, requestedTo)).id)
  let lastChangedAt = null
  let completedWindows = 0
  const summary = {
    dryRun: args.dryRun,
    sourceChannel: 'naver',
    sourceAccountKey: args.accountKey,
    requestedFrom,
    requestedTo,
    windowCount: windows.length,
    changedCount: 0,
    detailCount: 0,
    rawEventCount: 0,
    rawLineCount: 0,
    projectedCount: 0,
    excludedCount: 0,
    deletedCount: 0,
    unresolvedCount: 0,
    mappingRowCount: productMappings.length,
  }

  try {
    let syntheticWindowId = 1
    for (const window of windows) {
      const windowRow = args.dryRun
        ? { id: syntheticWindowId += 1 }
        : await createSyncWindow(targetConfig, runId, window)

      console.log(`[naver-sync] window ${window.windowFrom} -> ${window.windowTo}`)

      try {
        const { items: changedItems, pages } = await fetchChangedStatusesForWindow(
          naverConfig,
          requestState,
          accessToken,
          window,
          args.limitCount,
        )

        const latestEventMap = pickLatestEventByLine(changedItems)
        const eventRows = changedItems.map((item) =>
          buildChangedStatusEventRow({
            item,
            runId,
            windowId: args.dryRun ? null : Number(windowRow.id),
            sourceChannel: 'naver',
            sourceAccountKey: args.accountKey,
          }))

        const productOrderIds = [...latestEventMap.keys()]
        const detailInfos = productOrderIds.length > 0
          ? await fetchProductOrderDetails(naverConfig, requestState, accessToken, productOrderIds, args.detailBatchSize)
          : []

        const records = detailInfos.map((orderInfo) => {
          const sourceLineId = String(orderInfo?.productOrder?.productOrderId || '').trim()
          return resolveNaverSyncRecord({
            orderInfo,
            latestEvent: latestEventMap.get(sourceLineId) || null,
            productLookup,
            productMappingLookup,
            runId,
            sourceChannel: 'naver',
            sourceAccountKey: args.accountKey,
          })
        })

        const rawLineRows = records.map((record) => record.rawLine)
        const purchaseRows = records.filter((record) => record.purchase).map((record) => record.purchase)
        const excludedIds = records.filter((record) => !record.eligible).map((record) => record.rawLine.source_line_id)
        const unresolvedRecords = records.filter((record) => record.eligible && !record.purchase)

        for (const item of changedItems) {
          if (!item?.lastChangedDate) continue
          if (!lastChangedAt || item.lastChangedDate > lastChangedAt) {
            lastChangedAt = item.lastChangedDate
          }
        }

        summary.changedCount += changedItems.length
        summary.detailCount += detailInfos.length
        summary.rawEventCount += eventRows.length
        summary.rawLineCount += rawLineRows.length
        summary.projectedCount += purchaseRows.length
        summary.excludedCount += excludedIds.length
        summary.deletedCount += excludedIds.length
        summary.unresolvedCount += unresolvedRecords.length

        if (!args.dryRun) {
          await upsertRows(
            targetConfig,
            'commerce_order_events_raw',
            'source_channel,source_account_key,source_line_id,event_at,event_type',
            eventRows,
          )
          await upsertRows(
            targetConfig,
            'commerce_order_lines_raw',
            'source_channel,source_account_key,source_line_id',
            rawLineRows,
          )
          await upsertRows(targetConfig, 'purchases', 'purchase_id', purchaseRows)
          await deleteProjectedPurchases(targetConfig, excludedIds, args.accountKey)
          await updateSyncWindow(targetConfig, windowRow.id, {
            status: 'done',
            changed_count: changedItems.length,
            detail_count: detailInfos.length,
            upserted_count: purchaseRows.length,
            excluded_count: excludedIds.length,
            pagination_json: { pages },
          })
        } else {
          console.log(
            `[naver-sync][dry-run] changed=${changedItems.length} detail=${detailInfos.length} projected=${purchaseRows.length} excluded=${excludedIds.length} unresolved=${unresolvedRecords.length}`,
          )
        }

        completedWindows += 1
      } catch (error) {
        if (!args.dryRun) {
          await updateSyncWindow(targetConfig, windowRow.id, {
            status: 'failed',
            error_message: error instanceof Error ? error.message : String(error),
          })
        }
        throw error
      }
    }

    if (!args.dryRun) {
      await updateSyncRun(targetConfig, runId, buildSummaryPatch(summary, 'done'))
      await updateCursor(targetConfig, args, runId, requestedFrom, requestedTo, lastChangedAt)
    }

    console.log(`[naver-sync] completed windows=${completedWindows}/${windows.length}`)
    console.log(JSON.stringify(summary, null, 2))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const status = completedWindows > 0 ? 'partial' : 'failed'
    if (!args.dryRun) {
      await updateSyncRun(targetConfig, runId, buildSummaryPatch(summary, status, reason))
    }
    throw error
  }
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

export {
  buildNaverConfig,
  fetchNaverAccessToken,
  parseArgs,
}
