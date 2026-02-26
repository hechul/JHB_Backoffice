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

  const profile = useState<CurrentUser>('current_user', () => ({
    id: '',
    name: '',
    email: '',
    role: 'viewer',
  }))
  const profileLoaded = useState<boolean>('profile_loaded', () => false)
  const authBootstrapped = useState<boolean>('current_user_auth_bootstrapped', () => false)
  const authListenerBound = useState<boolean>('current_user_auth_listener_bound', () => false)

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

  async function fetchProfile(userId?: string) {
    const uid = userId || supabaseUser.value?.id
    if (!uid) return

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, status')
        .eq('id', uid)
        .maybeSingle()

      if (data && !error) {
        const email = (data as any).email || ''
        profile.value = {
          id: (data as any).id,
          name: (data as any).full_name || splitEmail(email),
          email,
          role: normalizeRole((data as any).role),
        }
        profileLoaded.value = true
      } else {
        console.error('Failed to fetch profile row:', error)
        resetProfile()
      }
    } catch (e) {
      console.error('Failed to fetch profile:', e)
      resetProfile()
    }
  }

  function splitEmail(email: string) {
    return String(email || '').split('@')[0] || ''
  }

  async function logout() {
    await supabase.auth.signOut()
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
        resetProfile()
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
    watch(supabaseUser, async (newUser) => {
      if (newUser?.id) {
        await fetchProfile(newUser.id)
      } else if (!newUser) {
        resetProfile()
      }
    }, { immediate: true })

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
