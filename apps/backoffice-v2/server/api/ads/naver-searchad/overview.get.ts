import { serverSupabaseUser } from '#supabase/server'
import { normalizeNaverSearchAdPreset } from '../../../../shared/naverSearchAd'
import { fetchNaverSearchAdOverview } from '../../../utils/searchad/naver-searchad'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: '로그인한 사용자만 검색광고 데이터를 조회할 수 있습니다.',
    })
  }

  const query = getQuery(event)
  const preset = normalizeNaverSearchAdPreset(query.preset)
  const force = String(query.force || '') === '1'
  const drillMonth = /^\d{4}-\d{2}$/.test(String(query.drillMonth || ''))
    ? String(query.drillMonth)
    : undefined

  return await fetchNaverSearchAdOverview(preset, { force, drillMonth })
})
