interface NotificationType {
  type: 'success' | 'info' | 'warning' | 'error'
}

interface NotificationItem extends NotificationType {
  id: string
  title: string
  message: string
  createdAt: string
  isRead: boolean
  link: string
}

interface CreateNotificationInput extends NotificationType {
  title: string
  message: string
  link?: string
  payload?: Record<string, any>
}

const DEFAULT_LIMIT = 30

function normalizeType(value: unknown): NotificationType['type'] {
  const raw = String(value || '').toLowerCase()
  if (raw === 'success' || raw === 'warning' || raw === 'error') return raw
  return 'info'
}

function normalizeLink(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (!raw.startsWith('/')) return ''
  return raw
}

function isMissingTableError(error: any): boolean {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || '').toLowerCase()
  if (code === '42P01') return true
  if (message.includes('relation') && message.includes('notifications')) return true
  return false
}

function mapNotificationRow(row: any): NotificationItem {
  const payload = (row?.payload_json && typeof row.payload_json === 'object') ? row.payload_json : {}
  return {
    id: String(row?.id || ''),
    type: normalizeType(row?.type),
    title: String(row?.title || ''),
    message: String(row?.body || ''),
    createdAt: String(row?.created_at || ''),
    isRead: Boolean(row?.is_read),
    link: normalizeLink(payload?.link),
  }
}

export function useNotifications() {
  const supabase = useSupabaseClient()
  const { user, profileLoaded, profileRevision } = useCurrentUser()

  const notifications = useState<NotificationItem[]>('notifications_items', () => [])
  const unreadCount = computed(() => notifications.value.filter((item) => !item.isRead).length)
  const loading = useState<boolean>('notifications_loading', () => false)
  const tableReady = useState<boolean>('notifications_table_ready', () => true)
  const errorMessage = useState<string>('notifications_error_message', () => '')
  const fetchSeq = useState<number>('notifications_fetch_seq', () => 0)
  const inFlight = useState<Promise<void> | null>('notifications_fetch_inflight', () => null)
  const watcherBound = useState<boolean>('notifications_watcher_bound', () => false)
  const lastUserId = useState<string>('notifications_last_user_id', () => '')

  async function refreshNotifications(limit = DEFAULT_LIMIT, force = false) {
    if (!profileLoaded.value) return
    const uid = String(user.value.id || '')
    if (!uid) {
      notifications.value = []
      return
    }
    if (!force && inFlight.value) {
      await inFlight.value
      return
    }

    const seq = ++fetchSeq.value
    loading.value = true
    errorMessage.value = ''

    const work = (async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, body, payload_json, is_read, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (seq !== fetchSeq.value) return

      if (error) {
        if (isMissingTableError(error)) {
          tableReady.value = false
          notifications.value = []
          return
        }
        throw error
      }

      tableReady.value = true
      notifications.value = (data || []).map((row) => mapNotificationRow(row))
    })()

    inFlight.value = work

    try {
      await work
    } catch (error: any) {
      if (seq === fetchSeq.value) {
        console.error('Failed to load notifications:', error)
        errorMessage.value = String(error?.message || '알림을 불러오지 못했습니다.')
      }
    } finally {
      if (seq === fetchSeq.value) loading.value = false
      if (inFlight.value === work) inFlight.value = null
    }
  }

  async function markRead(id: string) {
    const uid = String(user.value.id || '')
    const targetId = String(id || '')
    if (!uid || !targetId || !tableReady.value) return

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', targetId)
      .eq('user_id', uid)

    if (error) {
      if (!isMissingTableError(error)) {
        console.error('Failed to mark notification as read:', error)
      }
      return
    }

    const found = notifications.value.find((item) => item.id === targetId)
    if (found) found.isRead = true
  }

  async function markAllRead() {
    const uid = String(user.value.id || '')
    if (!uid || !tableReady.value) return
    if (!notifications.value.some((item) => !item.isRead)) return

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', uid)
      .eq('is_read', false)

    if (error) {
      if (!isMissingTableError(error)) {
        console.error('Failed to mark all notifications as read:', error)
      }
      return
    }

    notifications.value = notifications.value.map((item) => ({ ...item, isRead: true }))
  }

  async function createNotification(input: CreateNotificationInput) {
    const uid = String(user.value.id || '')
    if (!uid || !profileLoaded.value) return false

    const link = normalizeLink(input.link)
    const payload = { ...(input.payload || {}) } as Record<string, any>
    if (link) payload.link = link

    const row = {
      user_id: uid,
      type: normalizeType(input.type),
      title: String(input.title || '').trim(),
      body: String(input.message || '').trim(),
      payload_json: payload,
      is_read: false,
    }

    if (!row.title || !row.body) return false

    const { data, error } = await supabase
      .from('notifications')
      .insert(row)
      .select('id, type, title, body, payload_json, is_read, created_at')
      .maybeSingle()

    if (error) {
      if (isMissingTableError(error)) {
        tableReady.value = false
        return false
      }
      console.error('Failed to create notification:', error)
      return false
    }

    tableReady.value = true

    if (data) {
      const mapped = mapNotificationRow(data)
      notifications.value = [mapped, ...notifications.value.filter((item) => item.id !== mapped.id)].slice(0, DEFAULT_LIMIT)
    } else {
      await refreshNotifications(DEFAULT_LIMIT, true)
    }
    return true
  }

  if (import.meta.client && !watcherBound.value) {
    watcherBound.value = true
    watch(
      () => [profileLoaded.value, profileRevision.value, user.value.id],
      async ([loaded, _revision, uid]) => {
        if (!loaded) return
        const currentUid = String(uid || '')
        if (!currentUid) {
          notifications.value = []
          return
        }

        if (lastUserId.value !== currentUid) {
          notifications.value = []
          lastUserId.value = currentUid
        }

        await refreshNotifications(DEFAULT_LIMIT, true)
      },
      { immediate: true },
    )
  }

  return {
    notifications,
    unreadCount,
    loading,
    tableReady,
    errorMessage,
    refreshNotifications,
    markRead,
    markAllRead,
    createNotification,
  }
}
