export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  const supabase = useSupabaseClient()

  async function resolveSessionUser() {
    if (user.value) return user.value
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.error('auth middleware getSession error:', error)
        return null
      }
      return data.session?.user || null
    } catch (error) {
      console.error('auth middleware getSession exception:', error)
      return null
    }
  }

  const sessionUser = await resolveSessionUser()

  // 로그인 페이지는 누구나 접근 가능
  if (to.path === '/login') {
    // 이미 로그인된 상태면 홈으로
    if (sessionUser) {
      return navigateTo('/')
    }
    return
  }

  // 비로그인 → 로그인 페이지로 리디렉트
  if (!sessionUser) {
    return navigateTo('/login')
  }
})
