import { serverSupabaseUser } from '#supabase/server'

import { fetchNaverSearchAdTrendByMonth, normalizeNaverSearchAdMonthToken } from '../../../utils/searchad/naver-searchad'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: '로그인한 사용자만 검색광고 데이터를 조회할 수 있습니다.',
    })
  }

  const query = getQuery(event)
  const month = normalizeNaverSearchAdMonthToken(query.month)
  if (!month) {
    throw createError({
      statusCode: 400,
      message: 'month 쿼리는 YYYY-MM 형식이어야 합니다.',
    })
  }

  const force = String(query.force || '') === '1'

  return {
    month,
    daily: await fetchNaverSearchAdTrendByMonth(month, { force }),
  }
})
