interface PostcodeLookupBody {
  addresses?: string[]
}

interface KakaoAddressResponse {
  documents?: Array<{
    address?: {
      zip_code?: string
    }
    road_address?: {
      zone_no?: string
    }
  }>
}

interface PostcodeLookupMeta {
  provider: 'kakao' | 'none'
  keyConfigured: boolean
  attempted: number
  success: number
  rateLimited: number
}

function findInlinePostcode(address: string): string {
  const matched = String(address || '').trim().match(/(?:^|\s|\(|\[)(\d{5})(?:\)|\]|\s|$)/)
  return matched?.[1] || ''
}

function normalizeAddress(address: string): string {
  return String(address || '')
    .replace(/^\s*[\[(]?\d{5}[\])]?\s+/, '')
    .replace(/^대한민국\s+/u, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripParentheses(address: string): string {
  return String(address || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
}

function stripUnitDetail(address: string): string {
  return String(address || '')
    .replace(/\/.*$/, '')
    .replace(/,\s*[^,]+$/, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+\d+동\s*\d+호.*$/u, '')
    .replace(/\s+\d+동.*$/u, '')
    .replace(/\s+\d+호.*$/u, '')
    .replace(/\s+\d+층.*$/u, '')
    .replace(/\s+상세주소.*$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function shortenTokenAddress(address: string, tokenCount = 5): string {
  const tokens = String(address || '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length <= tokenCount) return tokens.join(' ')
  return tokens.slice(0, tokenCount).join(' ')
}

function buildAddressCandidates(rawAddress: string): string[] {
  const base = normalizeAddress(rawAddress)
  const noParen = stripParentheses(base)
  const noUnit = stripUnitDetail(noParen)
  const noComma = noUnit.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  const shortened6 = shortenTokenAddress(noComma, 6)
  const shortened5 = shortenTokenAddress(noComma, 5)
  const shortened4 = shortenTokenAddress(noComma, 4)

  const candidates = [base, noParen, noUnit, noComma, shortened6, shortened5, shortened4]
    .map((value) => value.trim())
    .filter((value) => value.length >= 6)

  return Array.from(new Set(candidates))
}

function normalizePostcode(value: string): string {
  const digits = String(value || '').replace(/[^0-9]/g, '')
  return digits.length === 5 ? digits : ''
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event)
  const body = await readBody<PostcodeLookupBody>(event)
  const addresses = Array.from(new Set((body?.addresses || []).map((address) => String(address || '').trim()).filter(Boolean)))
  const result: Record<string, string> = {}
  const meta: PostcodeLookupMeta = {
    provider: 'none',
    keyConfigured: false,
    attempted: 0,
    success: 0,
    rateLimited: 0,
  }

  if (addresses.length === 0) {
    return { postcodes: result, unresolved: [] as string[], meta }
  }

  if (addresses.length > 300) {
    throw createError({ statusCode: 400, statusMessage: '주소는 최대 300개까지 조회할 수 있습니다.' })
  }

  for (const address of addresses) {
    const inline = findInlinePostcode(address)
    if (inline) result[address] = inline
  }

  const unresolved = addresses.filter((address) => !result[address])
  if (unresolved.length === 0) {
    return { postcodes: result, unresolved: [] as string[], meta }
  }

  const kakaoKey = String(runtimeConfig.kakaoRestApiKey || '').trim()
  meta.keyConfigured = Boolean(kakaoKey)
  if (!kakaoKey) {
    return { postcodes: result, unresolved, meta }
  }
  meta.provider = 'kakao'

  const postcodeCache = new Map<string, string | null>()

  for (const address of unresolved) {
    const candidates = buildAddressCandidates(address)
    let found = ''

    for (const candidate of candidates) {
      if (postcodeCache.has(candidate)) {
        const cached = postcodeCache.get(candidate)
        if (cached) found = cached
        break
      }

      try {
        meta.attempted += 1
        const response = await $fetch<KakaoAddressResponse>('https://dapi.kakao.com/v2/local/search/address.json', {
          method: 'GET',
          query: {
            query: candidate,
            size: 5,
            analyze_type: 'similar',
          },
          headers: {
            Authorization: `KakaoAK ${kakaoKey}`,
          },
        })

        const docs = response?.documents || []
        for (const doc of docs) {
          const postcode = normalizePostcode(
            doc?.road_address?.zone_no
            || doc?.address?.zip_code
            || '',
          )
          if (!postcode) continue
          postcodeCache.set(candidate, postcode)
          found = postcode
          meta.success += 1
          break
        }
        if (!found) postcodeCache.set(candidate, null)
        if (found) break
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || error?.response?.status || 0)
        if (statusCode === 429) {
          meta.rateLimited += 1
          await sleep(150)
        }
        postcodeCache.set(candidate, null)
        console.warn('[postcode lookup] failed:', candidate, statusCode || error)
      }
    }

    if (found) {
      result[address] = found
    }
  }

  return {
    postcodes: result,
    unresolved: addresses.filter((address) => !result[address]),
    meta,
  }
})
