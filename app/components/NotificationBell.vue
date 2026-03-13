<template>
  <div class="notification-bell" ref="bellRef">
    <button class="bell-btn" @click="togglePanel" :class="{ active: showPanel }" :disabled="!profileLoaded">
      <Bell :size="18" :stroke-width="1.8" />
      <span v-if="unreadCount > 0" class="bell-badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
    </button>

    <Transition name="dropdown">
      <div v-if="showPanel" class="notification-panel">
        <div class="panel-header">
          <span class="panel-title">알림</span>
          <div class="panel-actions">
            <button class="panel-action-btn" :disabled="loading" @click.stop="refreshNotifications()">
              <RefreshCw :size="12" :stroke-width="2" />
              새로고침
            </button>
            <button v-if="unreadCount > 0" class="panel-action-btn" @click.stop="handleMarkAllRead">모두 읽음</button>
          </div>
        </div>

        <div class="panel-body">
          <div v-if="!tableReady" class="notif-empty">
            알림 테이블이 설정되지 않았습니다.
            <br />
            <span class="text-xs text-muted">`docs/sql/2026-03-03_notifications_phase15.sql` 실행이 필요합니다.</span>
          </div>
          <div v-else-if="loading && notifications.length === 0" class="notif-empty">
            알림 불러오는 중...
          </div>
          <div v-else-if="errorMessage" class="notif-empty">
            {{ errorMessage }}
          </div>
          <template v-else>
            <div
              v-for="notif in displayNotifications"
              :key="notif.id"
              class="notif-item"
              :class="{ unread: !notif.isRead }"
              @click="handleNotifClick(notif)"
            >
              <div class="notif-icon-wrap" :class="notif.type + '-wrap'">
                <component :is="getIcon(notif.type)" :size="14" :stroke-width="2" />
              </div>
              <div class="notif-content">
                <span class="notif-title">{{ notif.title }}</span>
                <span class="notif-message">{{ notif.message }}</span>
                <span class="notif-time">{{ notif.timeLabel }}</span>
              </div>
              <div v-if="!notif.isRead" class="notif-dot"></div>
            </div>

            <div v-if="displayNotifications.length === 0" class="notif-empty">
              새로운 알림이 없습니다.
            </div>
          </template>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { Bell, CheckCircle2, Upload, AlertTriangle, XCircle, Info, RefreshCw } from 'lucide-vue-next'

const route = useRoute()
const { profileLoaded } = useCurrentUser()
const {
  notifications,
  unreadCount,
  loading,
  tableReady,
  errorMessage,
  refreshNotifications,
  markRead,
  markAllRead,
} = useNotifications()

const showPanel = ref(false)
const bellRef = ref<HTMLElement | null>(null)
let refreshTimer: ReturnType<typeof setInterval> | null = null

interface DisplayNotification {
  id: string
  type: 'success' | 'info' | 'warning' | 'error'
  title: string
  message: string
  timeLabel: string
  isRead: boolean
  link: string
}

const displayNotifications = computed<DisplayNotification[]>(() => {
  return notifications.value.map((notif) => ({
    id: notif.id,
    type: notif.type,
    title: notif.title,
    message: notif.message,
    timeLabel: formatRelativeTime(notif.createdAt),
    isRead: notif.isRead,
    link: notif.link,
  }))
})

async function togglePanel() {
  showPanel.value = !showPanel.value
  if (showPanel.value) {
    await refreshNotifications()
  }
}

async function handleNotifClick(notif: DisplayNotification) {
  await markRead(notif.id)
  if (!notif.link) return
  showPanel.value = false
  await navigateTo(notif.link)
}

async function handleMarkAllRead() {
  await markAllRead()
}

function formatRelativeTime(value: string): string {
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return '-'
  const diffMs = Date.now() - target.getTime()
  if (diffMs < 0) return '방금 전'

  const min = Math.floor(diffMs / (1000 * 60))
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전`
  const day = Math.floor(hour / 24)
  if (day < 7) return `${day}일 전`
  return target.toLocaleDateString('ko-KR')
}

function getIcon(type: DisplayNotification['type']) {
  switch (type) {
    case 'success':
      return CheckCircle2
    case 'warning':
      return AlertTriangle
    case 'error':
      return XCircle
    case 'info':
      return Upload
    default:
      return Info
  }
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!showPanel.value) return
  const root = bellRef.value
  if (!root) {
    showPanel.value = false
    return
  }
  const target = event.target as Node | null
  if (target && root.contains(target)) return
  showPanel.value = false
}

function handleEscapeKey(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  showPanel.value = false
}

function handleWindowBlur() {
  showPanel.value = false
}

watch(() => route.fullPath, () => {
  showPanel.value = false
})

onMounted(async () => {
  if (import.meta.client) {
    document.addEventListener('pointerdown', handleDocumentPointerDown, true)
    window.addEventListener('keydown', handleEscapeKey)
    window.addEventListener('blur', handleWindowBlur)
  }
  await refreshNotifications()
  refreshTimer = setInterval(() => {
    refreshNotifications()
  }, 60000)
})

onBeforeUnmount(() => {
  if (import.meta.client) {
    document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
    window.removeEventListener('keydown', handleEscapeKey)
    window.removeEventListener('blur', handleWindowBlur)
  }
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.notification-bell {
  position: relative;
}

.bell-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  transition: all 0.15s ease;
}

.bell-btn:hover,
.bell-btn.active {
  background: var(--color-bg);
  color: var(--color-text);
}

.bell-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bell-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: var(--color-danger);
  color: #fff;
  font-size: 0.625rem;
  font-weight: 700;
  border-radius: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.notification-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 360px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: 200;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-border-light);
  gap: var(--space-sm);
}

.panel-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.panel-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6875rem;
  color: var(--color-primary);
  font-weight: 500;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  transition: all 0.12s ease;
}

.panel-action-btn:hover {
  background: var(--color-bg);
}

.panel-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.panel-body {
  max-height: 360px;
  overflow-y: auto;
}

.notif-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  cursor: pointer;
  transition: background 0.1s ease;
  position: relative;
}

.notif-item:hover {
  background: var(--color-bg);
}

.notif-item.unread {
  background: #FAFBFF;
}

.notif-icon-wrap {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}

.success-wrap {
  background: var(--color-success-light);
  color: var(--color-success);
}

.info-wrap {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.warning-wrap {
  background: var(--color-warning-light);
  color: #B45309;
}

.error-wrap {
  background: var(--color-danger-light);
  color: var(--color-danger);
}

.notif-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.notif-title {
  font-size: 0.8125rem;
  font-weight: 550;
  color: var(--color-text);
}

.notif-message {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.notif-time {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.notif-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-primary);
  flex-shrink: 0;
  margin-top: 8px;
}

.notif-empty {
  padding: var(--space-2xl);
  text-align: center;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.dropdown-enter-active {
  transition: all 0.15s ease-out;
}

.dropdown-leave-active {
  transition: all 0.1s ease-in;
}

.dropdown-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 768px) {
  .notification-panel {
    position: fixed;
    top: 72px;
    left: 12px;
    right: 12px;
    width: auto;
    max-height: min(70vh, 460px);
  }

  .panel-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .panel-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .panel-action-btn {
    justify-content: center;
  }
}
</style>
