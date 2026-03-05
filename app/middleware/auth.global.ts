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
  const pendingPath = '/pending-approval'

  async function resolveProfileStatus(userId: string) {
    try {
      const primary = await supabase
        .from('profiles')
        .select('status')
        .eq('id', userId)
        .maybeSingle()

      if (!primary.error) {
        if (!primary.data) return 'pending'
        const status = String((primary.data as any)?.status || '').trim().toLowerCase()
        return status || 'active'
      }

      const code = String((primary.error as any)?.code || '').toUpperCase()
      const message = String((primary.error as any)?.message || '').toLowerCase()
      const statusMissing = code === '42703' || message.includes('status')
      if (statusMissing) return 'active'

      console.error('auth middleware profile status query error:', primary.error)
      return 'pending'
    } catch (error) {
      console.error('auth middleware profile status exception:', error)
      return 'pending'
    }
  }

  // 로그인 페이지는 누구나 접근 가능
  if (to.path === '/login') {
    // 이미 로그인된 상태면 홈으로
    if (sessionUser) {
      const profileStatus = await resolveProfileStatus(sessionUser.id)
      if (profileStatus !== 'active') return navigateTo(pendingPath)
      return navigateTo('/')
    }
    return
  }

  // 비로그인 → 로그인 페이지로 리디렉트
  if (!sessionUser) {
    return navigateTo('/login')
  }

  const profileStatus = await resolveProfileStatus(sessionUser.id)
  const isActive = profileStatus === 'active'

  if (to.path === pendingPath) {
    if (isActive) return navigateTo('/')
    return
  }

  if (!isActive) {
    return navigateTo(pendingPath)
  }
})
