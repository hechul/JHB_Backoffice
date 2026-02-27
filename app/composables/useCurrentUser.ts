type UserRole = 'admin' | 'modifier' | 'viewer'

interface CurrentUser {
  id: string
  name: string
  email: string
  role: UserRole
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
  }))
  const profileLoaded = useState<boolean>('profile_loaded', () => false)
  const profileFetching = useState<boolean>('profile_fetching', () => false)
  const authBootstrapped = useState<boolean>('current_user_auth_bootstrapped', () => false)
  const authListenerBound = useState<boolean>('current_user_auth_listener_bound', () => false)
  const watcherBound = useState<boolean>('current_user_watcher_bound', () => false)

  const isViewer = computed(() => profileLoaded.value && profile.value.role === 'viewer')
  const isAdmin = computed(() => profileLoaded.value && profile.value.role === 'admin')
  const canModify = computed(() => !profileLoaded.value || profile.value.role === 'admin' || profile.value.role === 'modifier')

  const user = computed(() => profile.value)

  function normalizeRole(value: unknown): UserRole {
    const raw = String(value || '').trim().toLowerCase()
    if (raw === 'admin') return 'admin'
    if (raw === 'modifier') return 'modifier'
    return 'viewer'
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
      }
    } catch {
      return null
    }
  }

  function setProfileLoaded(next: CurrentUser, persist = true) {
    profile.value = next
    profileLoaded.value = true
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
        .select('id, email, full_name, role')
        .eq('id', uid)
        .maybeSingle()

      if (data && !error) {
        const email = (data as any).email || ''
        setProfileLoaded({
          id: (data as any).id,
          name: (data as any).full_name || splitEmail(email),
          email,
          role: normalizeRole((data as any).role),
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

  function splitEmail(email: string) {
    return String(email || '').split('@')[0] || ''
  }

  async function logout() {
    await supabase.auth.signOut()
    clearProfileCache()
    resetProfile()
    navigateTo('/login')
  }

  function resetProfile() {
    profile.value = { id: '', name: '', email: '', role: 'viewer' }
    profileLoaded.value = false
  }

  async function bootstrapAuthProfile() {
    try {
      const { data, error } = await supabase.auth.getUser()
      if (error) {
        console.error('Failed to read auth user:', error)
        const cached = readProfileCache()
        if (cached) {
          setProfileLoaded(cached, false)
        } else {
          resetProfile()
        }
        return
      }
      const uid = data.user?.id
      if (uid) {
        await fetchProfile(uid)
      } else {
        resetProfile()
      }
    } catch (e) {
      console.error('Failed to bootstrap auth profile:', e)
      resetProfile()
    }
  }

  // Auto-fetch profile when auth user/session changes
  if (import.meta.client) {
    // 서버 지연 (Vercel 환경 등) 발생 시 '확인중' 표시가 길어지는 것을 막기 위해, 즉시 캐시된 정보를 UI에 렌더링 (Optimistic UI)
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
      supabase.auth.onAuthStateChange(async (_event, session) => {
        const uid = session?.user?.id
        if (uid) {
          await fetchProfile(uid)
        } else {
          resetProfile()
        }
      })
    }

    if (!authBootstrapped.value) {
      authBootstrapped.value = true
      void bootstrapAuthProfile()
    }
  }

  return {
    user,
    isViewer,
    isAdmin,
    canModify,
    profileLoaded,
    fetchProfile,
    logout,
  }
}
