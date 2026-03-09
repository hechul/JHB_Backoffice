export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  const supabase = useSupabaseClient()

  async function resolveSessionUser() {
    if (user.value?.id) return user.value
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.error('auth middleware getSession error:', error)
        return null
      }
      return data.session?.user?.id ? data.session.user : null
    } catch (error) {
      console.error('auth middleware getSession exception:', error)
      return null
    }
  }

  const sessionUser = await resolveSessionUser()
  const pendingPath = '/pending-approval'

  function normalizeStatus(value: unknown) {
    const raw = String(value || '').trim().toLowerCase()
    if (raw === 'pending') return 'pending'
    if (raw === 'rejected') return 'rejected'
    if (raw === 'inactive') return 'inactive'
    return 'active'
  }

  function normalizeRole(value: unknown) {
    const raw = String(value || '').trim().toLowerCase()
    if (raw === 'admin') return 'admin'
    if (raw === 'modifier') return 'modifier'
    return 'viewer'
  }

  async function resolveProfileStatus(userId: string) {
    if (!userId || userId === 'undefined' || userId === 'null') {
      return 'active'
    }
    try {
      const primary = await supabase
        .from('profiles')
        .select('status, role')
        .eq('id', userId)
        .maybeSingle()

      if (!primary.error) {
        if (!primary.data) return 'active'
        const status = normalizeStatus((primary.data as any)?.status)
        const role = normalizeRole((primary.data as any)?.role)
        if (role === 'admin' && status === 'pending') return 'active'
        return status
      }

      const code = String((primary.error as any)?.code || '').toUpperCase()
      const message = String((primary.error as any)?.message || '').toLowerCase()
      const statusMissing = code === '42703' || message.includes('status')
      if (statusMissing) return 'active'

      console.error('auth middleware profile status query error:', primary.error)
      return 'active'
    } catch (error) {
      console.error('auth middleware profile status exception:', error)
      return 'active'
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
