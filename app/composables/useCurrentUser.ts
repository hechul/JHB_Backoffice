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
    profile.value = { id: '', name: '', email: '', role: 'viewer', status: 'active' }
    profileLoaded.value = false
    profileRevision.value += 1
  }

  // 제거됨: async function bootstrapAuthProfile()

  // Auto-fetch profile when auth user/session changes
  if (import.meta.client) {
    // 캐시는 UI 표시용 힌트로만 사용한다.
    // profileLoaded를 true로 먼저 올리면 세션 확정 전 DB 조회가 선행되어 빈 결과가 고정될 수 있다.
    if (!profileLoaded.value) {
      const cached = readProfileCache(supabaseUser.value?.id)
      if (cached) {
        profile.value = cached
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
    // 제거됨: bootstrapAuthProfile 호출
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
    logout,
  }
}
