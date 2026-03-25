import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({
    status: 0,
    stdout: JSON.stringify({
      client_id: 'mock-client-id',
      timestamp: '1711180000000',
      client_secret_sign: 'mock-signature',
    }),
    stderr: '',
  })),
}))

import {
  fetchNaverAccessToken,
  parseArgs,
} from '../../scripts/sync-naver-orders.mjs'

describe('sync-naver-orders helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('parses throttle controls for a narrower sync window', () => {
    const args = parseArgs([
      '--from=2025-12-01',
      '--to=2026-02-28',
      '--dry-run',
      '--limit-count=75',
      '--detail-batch-size=20',
    ])

    expect(args.dryRun).toBe(true)
    expect(args.limitCount).toBe(75)
    expect(args.detailBatchSize).toBe(20)
  })

  it('reuses an access token without calling the Naver token endpoint', async () => {
    const fetchMock = vi.mocked(global.fetch)

    const token = await fetchNaverAccessToken({
      clientId: 'unused',
      clientSecret: 'unused',
      apiBaseUrl: 'https://api.commerce.naver.com/external/v1',
      tokenType: 'SELF',
      accountId: null,
      accessToken: 'pre-issued-token',
    })

    expect(token).toBe('pre-issued-token')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces 429 token responses with enough context for manual throttling', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => '{"code":"GW.RATE_LIMIT","message":"잠시 후 다시 시도해주세요."}',
    } as Response)

    await expect(fetchNaverAccessToken({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      apiBaseUrl: 'https://api.commerce.naver.com/external/v1',
      tokenType: 'SELF',
      accountId: null,
      accessToken: null,
    })).rejects.toThrow('Naver token request failed: 429 Too Many Requests')
  })
})
