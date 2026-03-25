import { resolve } from 'node:path'
import { parseEnvFile } from './sync-master-data.mjs'
import {
  normalizeTargetMonths,
  runMonthlyFilter,
} from '../server/utils/filter/runMonthlyFilter.ts'
import {
  releaseMonthFilterLock,
  tryAcquireMonthFilterLock,
} from '../server/utils/filter/monthFilterLock.ts'

const DEFAULT_ENV = resolve(process.cwd(), '.env')

interface FilterScriptArgs {
  envPath: string
  months: string[]
  actorName: string
  actorId: string | null
}

async function sleep(ms: number) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function acquireMonthLockWithRetry(month: string, owner: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const acquired = tryAcquireMonthFilterLock({
      month,
      owner,
    })
    if (acquired.acquired) return acquired.lock
    await sleep(5000)
  }

  const fallback = tryAcquireMonthFilterLock({
    month,
    owner,
  })
  if (fallback.acquired) return fallback.lock
  return null
}

function printHelp() {
  console.log(`
Usage:
  node --experimental-strip-types scripts/run-filter-months.ts --months=2026-02,2026-03

Options:
  --months=LIST               Comma separated target_month values (YYYY-MM)
  --env=PATH                  Env file path (default: ./.env)
  --actor-name=VALUE          Audit actor label (default: 자동 재필터(sync))
  --actor-id=VALUE            Optional profiles.id for audit
  --help                      Show this help
`.trim())
}

function parseArgs(argv: string[]): FilterScriptArgs & { help: boolean } {
  const args: FilterScriptArgs & { help: boolean } = {
    envPath: DEFAULT_ENV,
    months: [],
    actorName: '자동 재필터(sync)',
    actorId: null,
    help: false,
  }

  for (const rawArg of argv) {
    if (rawArg === '--help' || rawArg === '-h') {
      args.help = true
      continue
    }
    if (!rawArg.startsWith('--')) continue
    const [key, ...rest] = rawArg.slice(2).split('=')
    const value = rest.join('=')
    if (key === 'months') {
      args.months = normalizeTargetMonths(value.split(',').map((month) => month.trim()))
      continue
    }
    if (key === 'env' && value) {
      args.envPath = resolve(process.cwd(), value)
      continue
    }
    if (key === 'actor-name' && value) {
      args.actorName = value
      continue
    }
    if (key === 'actor-id' && value) {
      args.actorId = value
    }
  }

  return args
}

function applyEnv(envPath: string) {
  const env = parseEnvFile(envPath)
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = String(value)
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  if (args.months.length === 0) {
    throw new Error('최소 한 개 이상의 target_month가 필요합니다. 예: --months=2026-02,2026-03')
  }

  applyEnv(args.envPath)

  const results = []
  const failures: Array<{ month: string; message: string }> = []
  for (const month of args.months) {
    const lock = await acquireMonthLockWithRetry(month, args.actorName)
    if (!lock) {
      const message = `${month} 필터링 잠금을 확보하지 못했습니다.`
      failures.push({ month, message })
      console.error(`[monthly-filter] failed ${month}: ${message}`)
      continue
    }

    try {
      console.log(`[monthly-filter] start ${month}`)
      const result = await runMonthlyFilter(month, {
        actorName: args.actorName,
        actorId: args.actorId,
      })
      results.push(result)
      console.log(`[monthly-filter] done ${month} status=${result.status} matched=${result.matchedCount} review=${result.pendingReviewCount}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ month, message })
      console.error(`[monthly-filter] failed ${month}: ${message}`)
    } finally {
      releaseMonthFilterLock({
        month,
        token: lock.token,
      })
    }
  }

  console.log(JSON.stringify({
    ok: failures.length === 0,
    months: args.months,
    results,
    failures,
  }, null, 2))

  if (failures.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
