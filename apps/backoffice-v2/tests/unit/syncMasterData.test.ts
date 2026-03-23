import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  buildClientConfig,
  chunk,
  parseArgs,
  parseEnvFile,
} from '../../scripts/sync-master-data.mjs'

const tempDirs: string[] = []

describe('sync-master-data script helpers', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('parses CLI args with entities and dry-run', () => {
    const args = parseArgs([
      '--entities=products,campaigns',
      '--dry-run',
      '--source-env=../.env',
      '--target-env=.env.local',
    ])

    expect(args.entities).toEqual(['products', 'campaigns'])
    expect(args.dryRun).toBe(true)
    expect(args.sourceEnv.endsWith('/.env')).toBe(true)
    expect(args.targetEnv.endsWith('/.env.local')).toBe(true)
  })

  it('parses env files with quoted and plain values', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sync-master-data-'))
    tempDirs.push(dir)
    const envPath = join(dir, '.env')

    await writeFile(
      envPath,
      [
        'NUXT_PUBLIC_SUPABASE_URL="https://example.supabase.co"',
        "SUPABASE_SERVICE_KEY='secret-key'",
        '# comment',
        'EMPTY=',
      ].join('\n'),
      'utf8',
    )

    const env = await parseEnvFile(envPath)
    expect(env).toEqual({
      NUXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_KEY: 'secret-key',
      EMPTY: '',
    })
  })

  it('builds client config and chunks arrays', () => {
    expect(buildClientConfig({
      NUXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_KEY: 'service-key',
    }, 'source')).toEqual({
      baseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
    })

    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})
