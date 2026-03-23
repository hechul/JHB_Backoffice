export default defineNuxtRouteMiddleware((to) => {
  const supabaseUser = useSupabaseUser()
  const { user, profileLoaded, fetchProfile } = useCurrentUser()

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

  function hasClientSessionHint() {
    if (!import.meta.client) return false

    try {
      const url = useRuntimeConfig().public?.supabase?.url || ''
      const projectRef = String(url).replace(/^https?:\/\//, '').split('.')[0]
      if (!projectRef) return false

      const storageKey = `sb-${projectRef}-auth-token`
      const raw = localStorage.getItem(storageKey)
      if (raw && raw !== 'null' && raw !== 'undefined') return true
      return document.cookie.includes(`${storageKey}=`)
    } catch {
      return false
    }
  }

  const sessionUserId = String(supabaseUser.value?.id || user.value.id || '').trim()
  const status = normalizeStatus(user.value.status)
  const role = normalizeRole(user.value.role)
  const isActive = status === 'active' || (role === 'admin' && status === 'pending')
  const hasSession = Boolean(sessionUserId)
  const hasSessionHint = hasSession || hasClientSessionHint()

  // Supabase 세션 동기화는 백그라운드에서만 수행한다.
  // 여기서 getSession()을 await 하면 탭 복귀/다중 탭에서 하이드레이션이 멈출 수 있다.
  if (hasSession && !profileLoaded.value) {
    void fetchProfile(sessionUserId)
  }

  if (to.path === '/login') {
    if (!hasSession) return
    if (profileLoaded.value && !isActive) return navigateTo(pendingPath)
    return navigateTo('/')
  }

  if (!hasSessionHint) {
    return navigateTo('/login')
  }

  // 저장된 세션 힌트는 있지만 실제 user 동기화가 아직 안 된 상태면
  // 일단 렌더를 허용하고 composable이 백그라운드에서 세션을 복구하게 둔다.
  if (!hasSession) {
    return
  }

  if (to.path === pendingPath) {
    if (profileLoaded.value && isActive) return navigateTo('/')
    return
  }

  if (profileLoaded.value && !isActive) {
    return navigateTo(pendingPath)
  }
})
