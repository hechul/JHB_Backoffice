type UserRole = 'admin' | 'modifier' | 'viewer'
type UserStatus = 'pending' | 'active' | 'rejected' | 'inactive'

interface CurrentUser {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
}

export function useCurrentUser() {
  const supabase = useSupabaseClient()
  const supabaseUser = useSupabaseUser()
  const PROFILE_CACHE_KEY = 'jhbiofarm_current_user_profile_v1'

  const profile = useState<CurrentUser>('current_user', () => ({
    id: '',
    name: '',
    email: '',
    role: 'viewer',
    status: 'active',
  }))
  const profileLoaded = useState<boolean>('profile_loaded', () => false)
  const profileRevision = useState<number>('profile_revision', () => 0)
  const profileFetching = useState<boolean>('profile_fetching', () => false)
  const authListenerBound = useState<boolean>('current_user_auth_listener_bound', () => false)
  const watcherBound = useState<boolean>('current_user_watcher_bound', () => false)
  const resumeListenerBound = useState<boolean>('current_user_resume_listener_bound', () => false)
  const resumeRefreshing = useState<boolean>('current_user_resume_refreshing', () => false)

  const isViewer = computed(() => profileLoaded.value && profile.value.role === 'viewer')
  const isAdmin = computed(() => profileLoaded.value && profile.value.role === 'admin')
  const isApproved = computed(() => profileLoaded.value && profile.value.status === 'active')
  const canModify = computed(() => !profileLoaded.value || (
    profile.value.status === 'active' &&
    (profile.value.role === 'admin' || profile.value.role === 'modifier')
  ))

  const user = computed(() => profile.value)

  function normalizeRole(value: unknown): UserRole {
    const raw = String(value || '').trim().toLowerCase()
    if (raw === 'admin') return 'admin'
    if (raw === 'modifier') return 'modifier'
    return 'viewer'
  }

  function normalizeStatus(value: unknown): UserStatus {
    const raw = String(value || '').trim().toLowerCase()
    if (raw === 'pending') return 'pending'
    if (raw === 'rejected') return 'rejected'
    if (raw === 'inactive') return 'inactive'
    return 'active'
  }

  function persistProfileCache(next: CurrentUser) {
    if (!import.meta.client) return
    try {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(next))
    } catch { }
  }

  function clearProfileCache() {
    if (!import.meta.client) return
    try {
      localStorage.removeItem(PROFILE_CACHE_KEY)
    } catch { }
  }

  function readProfileCache(userId?: string): CurrentUser | null {
    if (!import.meta.client) return null
    try {
      const raw = localStorage.getItem(PROFILE_CACHE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as CurrentUser
      if (!parsed?.id) return null
      if (userId && parsed.id !== userId) return null
      return {
        id: String(parsed.id || ''),
        name: String(parsed.name || ''),
        email: String(parsed.email || ''),
        role: normalizeRole(parsed.role),
        status: normalizeStatus(parsed.status),
      }
    } catch {
      return null
    }
  }

  function setProfileLoaded(next: CurrentUser, persist = true) {
    profile.value = next
    profileLoaded.value = true
    profileRevision.value += 1
    if (persist) persistProfileCache(next)
  }

  function applyProfileFallback(userId: string) {
    const cached = readProfileCache(userId)
    if (cached) {
      setProfileLoaded(cached, false)
      return
    }

    const authEmail = String(supabaseUser.value?.email || '')
    setProfileLoaded({
      id: userId,
      name: splitEmail(authEmail),
      email: authEmail,
      role: 'viewer',
      status: 'active',
    }, false)
  }

  async function fetchProfile(userId?: string) {
    const uid = userId || supabaseUser.value?.id
    if (!uid) return

    if (profileFetching.value) return // 중복 호출 방지
    profileFetching.value = true

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, status')
        .eq('id', uid)
        .maybeSingle()

      if (data && !error) {
        const email = (data as any).email || ''
        setProfileLoaded({
          id: (data as any).id,
          name: (data as any).full_name || splitEmail(email),
          email,
          role: normalizeRole((data as any).role),
          status: normalizeStatus((data as any).status),
        })
      } else {
        console.error('Failed to fetch profile row:', error)
        applyProfileFallback(uid)
      }
    } catch (e) {
      console.error('Failed to fetch profile:', e)
      applyProfileFallback(uid)
    } finally {
      profileFetching.value = false
    }
  }

  async function refreshProfileFromSession() {
    if (resumeRefreshing.value) return
    resumeRefreshing.value = true

    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.error('Failed to refresh session on resume:', error)
        return
      }

      const uid = data.session?.user?.id
      if (uid) {
        await fetchProfile(uid)
        return
      }

      clearProfileCache()
      resetProfile()
    } catch (error) {
      console.error('Failed to refresh profile on resume:', error)
    } finally {
      resumeRefreshing.value = false
    }
  }

  function splitEmail(email: string) {
    return String(email || '').split('@')[0] || ''
  }

  async function logout() {
    const { error } = await supabase.auth.signOut()
    clearProfileCache()
    resetProfile()
    await navigateTo('/login', { replace: true })
    if (error) {
      console.error('Failed to sign out:', error)
    }
  }

  function resetProfile() {
    profile.value = { id: '', name: '', email: '', role: 'viewer', status: 'active' }
    profileLoaded.value = false
    profileRevision.value += 1
  }

  async function bootstrapAuthProfile() {
    if (!import.meta.client) return
    if (profileLoaded.value) return
    if (supabaseUser.value?.id) {
      await fetchProfile(supabaseUser.value.id)
      return
    }

    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.error('Failed to bootstrap auth session:', error)
        return
      }

      const uid = data.session?.user?.id
      if (uid) {
        await fetchProfile(uid)
        return
      }
    } catch (error) {
      console.error('Failed to bootstrap auth profile:', error)
    }
  }

  // Auto-fetch profile when auth user/session changes
  if (import.meta.client) {
    if (!profileLoaded.value) {
      const cached = readProfileCache(supabaseUser.value?.id)
      if (cached) {
        setProfileLoaded(cached, false)
      }
    }

    if (!watcherBound.value) {
      watcherBound.value = true
      watch(supabaseUser, async (newUser) => {
        if (newUser?.id) {
          await fetchProfile(newUser.id)
        } else if (!newUser) {
          resetProfile()
        }
      }, { immediate: true })
    }

    if (!authListenerBound.value) {
      authListenerBound.value = true
      supabase.auth.onAuthStateChange((_event, session) => {
        const uid = session?.user?.id
        if (uid) {
          void fetchProfile(uid)
        } else {
          clearProfileCache()
          resetProfile()
        }
      })
    }

    if (!resumeListenerBound.value) {
      resumeListenerBound.value = true

      const handleWindowResume = () => {
        void refreshProfileFromSession()
      }

      const handleVisibilityChange = () => {
        if (document.visibilityState !== 'visible') return
        void refreshProfileFromSession()
      }

      window.addEventListener('focus', handleWindowResume)
      window.addEventListener('pageshow', handleWindowResume)
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    void bootstrapAuthProfile()
  }

  return {
    user,
    isViewer,
    isAdmin,
    isApproved,
    canModify,
    profileLoaded,
    profileRevision,
    fetchProfile,
    refreshProfileFromSession,
    logout,
  }
}
