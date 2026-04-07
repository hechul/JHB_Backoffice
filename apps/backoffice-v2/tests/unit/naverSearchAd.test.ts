import { describe, expect, it } from 'vitest'

import {
  computeNaverSearchAdRoas,
  formatNaverSearchAdCompetition,
  normalizeNaverSearchAdPreset,
  parseNaverSearchAdMonthlyValue,
} from '../../shared/naverSearchAd'
import {
  buildNaverSearchAdMonthlyRanges,
  buildNaverSearchAdTimeRange,
  normalizeNaverSearchAdMonthToken,
} from '../../server/utils/searchad/naver-searchad'

describe('naver searchad helpers', () => {
  it('normalizes presets safely', () => {
    expect(normalizeNaverSearchAdPreset('thisMonth')).toBe('thisMonth')
    expect(normalizeNaverSearchAdPreset('last7days')).toBe('last7days')
    expect(normalizeNaverSearchAdPreset('weird')).toBe('thisMonth')
  })

  it('builds KST time ranges for supported presets', () => {
    const now = new Date('2026-04-06T03:00:00.000Z')

    expect(buildNaverSearchAdTimeRange('thisMonth', now)).toMatchObject({
      preset: 'thisMonth',
      timeRange: {
        since: '2026-04-01',
        until: '2026-04-06',
      },
    })

    expect(buildNaverSearchAdTimeRange('last7days', now).timeRange).toEqual({
      since: '2026-03-31',
      until: '2026-04-06',
    })
  })

  it('builds monthly ranges for the recent months window', () => {
    const now = new Date('2026-04-06T03:00:00.000Z')
    const ranges = buildNaverSearchAdMonthlyRanges(now, 3)

    expect(ranges).toEqual([
      {
        month: '2026-02',
        timeRange: {
          since: '2026-02-01',
          until: '2026-02-28',
        },
      },
      {
        month: '2026-03',
        timeRange: {
          since: '2026-03-01',
          until: '2026-03-31',
        },
      },
      {
        month: '2026-04',
        timeRange: {
          since: '2026-04-01',
          until: '2026-04-06',
        },
      },
    ])
  })

  it('computes roas and parses keyword-tool metrics', () => {
    expect(computeNaverSearchAdRoas(100000, 350000)).toBe(350)
    expect(computeNaverSearchAdRoas(0, 1000)).toBe(0)
    expect(parseNaverSearchAdMonthlyValue('< 10')).toBe(9)
    expect(parseNaverSearchAdMonthlyValue('120')).toBe(120)
    expect(parseNaverSearchAdMonthlyValue('')).toBeNull()
    expect(formatNaverSearchAdCompetition('')).toBe('정보 없음')
    expect(normalizeNaverSearchAdMonthToken('2026-04')).toBe('2026-04')
    expect(normalizeNaverSearchAdMonthToken('2026-4')).toBeNull()
  })
})
