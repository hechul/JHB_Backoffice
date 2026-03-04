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

function findInlinePostcode(address: string): string {
  const matched = String(address || '').trim().match(/^(\d{5})\s+/)
  return matched?.[1] || ''
}

function normalizePostcode(value: string): string {
  const digits = String(value || '').replace(/[^0-9]/g, '')
  return digits.length === 5 ? digits : ''
}

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event)
  const body = await readBody<PostcodeLookupBody>(event)
  const addresses = Array.from(new Set((body?.addresses || []).map((address) => String(address || '').trim()).filter(Boolean)))
  const result: Record<string, string> = {}

  if (addresses.length === 0) {
    return { postcodes: result, unresolved: [] as string[] }
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
    return { postcodes: result, unresolved: [] as string[] }
  }

  const kakaoKey = String(runtimeConfig.kakaoRestApiKey || '').trim()
  if (!kakaoKey) {
    return { postcodes: result, unresolved }
  }

  for (const address of unresolved) {
    try {
      const response = await $fetch<KakaoAddressResponse>('https://dapi.kakao.com/v2/local/search/address.json', {
        method: 'GET',
        query: { query: address, size: 1 },
        headers: {
          Authorization: `KakaoAK ${kakaoKey}`,
        },
      })

      const first = response?.documents?.[0]
      const postcode = normalizePostcode(
        first?.road_address?.zone_no
        || first?.address?.zip_code
        || '',
      )

      if (postcode) result[address] = postcode
    } catch (error) {
      console.warn('[postcode lookup] failed:', address, error)
    }
  }

  return {
    postcodes: result,
    unresolved: addresses.filter((address) => !result[address]),
  }
})
