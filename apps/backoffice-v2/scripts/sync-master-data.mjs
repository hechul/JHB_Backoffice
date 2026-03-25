import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const DEFAULT_SOURCE_ENV = resolve(process.cwd(), '..', '..', '.env')
const DEFAULT_TARGET_ENV = resolve(process.cwd(), '.env')
const DEFAULT_ENTITIES = ['products', 'campaigns']

const ENTITY_CONFIG = {
  products: {
    path: 'products',
    select: [
      'product_id',
      'product_name',
      'option_name',
      'pet_type',
      'stage',
      'product_line',
      'expected_consumption_days',
      'deleted_at',
      'created_at',
    ].join(','),
    order: 'product_name.asc',
    conflict: 'product_id',
    normalize(row) {
      return {
        product_id: String(row.product_id),
        product_name: String(row.product_name),
        option_name: row.option_name ?? null,
        pet_type: row.pet_type ?? 'BOTH',
        stage: row.stage ?? null,
        product_line: row.product_line ?? null,
        expected_consumption_days: row.expected_consumption_days ?? null,
        deleted_at: row.deleted_at ?? null,
        created_at: row.created_at ?? null,
      }
    },
  },
  campaigns: {
    path: 'campaigns',
    select: [
      'id',
      'name',
      'agency',
      'start_date',
      'end_date',
      'budget',
      'created_at',
      'deleted_at',
    ].join(','),
    order: 'id.asc',
    conflict: 'id',
    normalize(row) {
      return {
        id: Number(row.id),
        name: String(row.name),
        agency: row.agency ?? null,
        start_date: row.start_date ?? null,
        end_date: row.end_date ?? null,
        budget: row.budget ?? null,
        created_at: row.created_at ?? null,
        deleted_at: row.deleted_at ?? null,
      }
    },
  },
}

function parseArgs(argv) {
  const args = {
    sourceEnv: DEFAULT_SOURCE_ENV,
    targetEnv: DEFAULT_TARGET_ENV,
    entities: DEFAULT_ENTITIES,
    dryRun: false,
  }

  for (const rawArg of argv) {
    if (rawArg === '--dry-run') {
      args.dryRun = true
      continue
    }
    if (rawArg.startsWith('--source-env=')) {
      args.sourceEnv = resolve(process.cwd(), rawArg.slice('--source-env='.length))
      continue
    }
    if (rawArg.startsWith('--target-env=')) {
      args.targetEnv = resolve(process.cwd(), rawArg.slice('--target-env='.length))
      continue
    }
    if (rawArg.startsWith('--entities=')) {
      args.entities = rawArg
        .slice('--entities='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      continue
    }
    throw new Error(`Unknown argument: ${rawArg}`)
  }

  return args
}

async function parseEnvFile(filePath) {
  const content = await readFile(filePath, 'utf8')
  const env = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex < 0) continue
    const key = line.slice(0, eqIndex).trim()
    let value = line.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }

  return env
}

function buildClientConfig(env, label) {
  const baseUrl = String(env.NUXT_PUBLIC_SUPABASE_URL || '').trim()
  const serviceKey = String(env.SUPABASE_SERVICE_KEY || '').trim()
  if (!baseUrl || !serviceKey) {
    throw new Error(`${label} env is missing NUXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY`)
  }
  return { baseUrl, serviceKey }
}

async function restRequest(config, path, init = {}) {
  const response = await fetch(`${config.baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${response.status} ${response.statusText}: ${body}`)
  }

  if (response.status === 204) return null
  const body = await response.text()
  if (!body.trim()) return null
  return JSON.parse(body)
}

function chunk(rows, size = 500) {
  const result = []
  for (let i = 0; i < rows.length; i += size) {
    result.push(rows.slice(i, i + size))
  }
  return result
}

async function fetchEntityRows(sourceConfig, entityName) {
  const entity = ENTITY_CONFIG[entityName]
  if (!entity) throw new Error(`Unsupported entity: ${entityName}`)
  const query = `${entity.path}?select=${encodeURIComponent(entity.select)}&order=${entity.order}`
  const rows = await restRequest(sourceConfig, query, { method: 'GET' })
  return Array.isArray(rows) ? rows.map(entity.normalize) : []
}

async function upsertEntityRows(targetConfig, entityName, rows) {
  const entity = ENTITY_CONFIG[entityName]
  if (!entity) throw new Error(`Unsupported entity: ${entityName}`)
  if (rows.length === 0) return 0

  let total = 0
  for (const batch of chunk(rows)) {
    await restRequest(
      targetConfig,
      `${entity.path}?on_conflict=${encodeURIComponent(entity.conflict)}`,
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(batch),
      },
    )
    total += batch.length
  }

  return total
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sourceEnv = await parseEnvFile(args.sourceEnv)
  const targetEnv = await parseEnvFile(args.targetEnv)
  const sourceConfig = buildClientConfig(sourceEnv, 'source')
  const targetConfig = buildClientConfig(targetEnv, 'target')

  for (const entityName of args.entities) {
    const rows = await fetchEntityRows(sourceConfig, entityName)
    console.log(`[${entityName}] fetched ${rows.length} rows from source`)
    if (args.dryRun) continue
    const upserted = await upsertEntityRows(targetConfig, entityName, rows)
    console.log(`[${entityName}] upserted ${upserted} rows into target`)
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
  DEFAULT_ENTITIES,
  ENTITY_CONFIG,
  buildClientConfig,
  chunk,
  parseArgs,
  parseEnvFile,
  restRequest,
}
