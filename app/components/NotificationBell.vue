<template>
  <div class="notification-bell" ref="bellRef">
    <button class="bell-btn" @click="togglePanel" :class="{ active: showPanel }">
      <Bell :size="18" :stroke-width="1.8" />
      <span v-if="unreadCount > 0" class="bell-badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
    </button>

    <!-- Dropdown Panel -->
    <Transition name="dropdown">
      <div v-if="showPanel" class="notification-panel">
        <div class="panel-header">
          <span class="panel-title">알림</span>
          <button v-if="unreadCount > 0" class="mark-all-btn" @click="markAllRead">모두 읽음</button>
        </div>
        <div class="panel-body">
          <div
            v-for="notif in notifications"
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
              <span class="notif-time">{{ notif.time }}</span>
            </div>
            <div v-if="!notif.isRead" class="notif-dot"></div>
          </div>
          <div v-if="notifications.length === 0" class="notif-empty">
            새로운 알림이 없습니다.
          </div>
        </div>
      </div>
    </Transition>

    <!-- Overlay -->
    <div v-if="showPanel" class="bell-overlay" @click="showPanel = false"></div>
  </div>
</template>

<script setup lang="ts">
import { Bell, CheckCircle2, Upload, AlertTriangle, XCircle } from 'lucide-vue-next'

const showPanel = ref(false)
const bellRef = ref<HTMLElement | null>(null)

interface Notification {
  id: number
  type: string
  title: string
  message: string
  time: string
  isRead: boolean
  link?: string
}

const notifications = ref<Notification[]>([
  {
    id: 1,
    type: 'success',
    title: '분석 완료',
    message: '340건 매칭, 1단계: 280건, 2단계: 42건',
    time: '10분 전',
    isRead: false,
    link: '/filter',
  },
  {
    id: 2,
    type: 'info',
    title: '데이터 업로드 완료',
    message: '주문 572건 등록 (신규 58건, 스킵 514건)',
    time: '12분 전',
    isRead: false,
    link: '/upload',
  },
  {
    id: 3,
    type: 'warning',
    title: '수량 경고',
    message: '수량 2개 이상 매칭 건 3건 확인 필요',
    time: '1시간 전',
    isRead: true,
    link: '/filter',
  },
  {
    id: 4,
    type: 'error',
    title: '상품 연결 실패',
    message: '체험단 미션상품 2건 연결 실패 — 직접 연결 필요',
    time: '어제',
    isRead: true,
    link: '/upload',
  },
])

const unreadCount = computed(() => notifications.value.filter(n => !n.isRead).length)

function togglePanel() {
  showPanel.value = !showPanel.value
}

function markRead(id: number) {
  const notif = notifications.value.find(n => n.id === id)
  if (notif) notif.isRead = true
}

function handleNotifClick(notif: Notification) {
  markRead(notif.id)
  if (notif.link) {
    showPanel.value = false
    navigateTo(notif.link)
  }
}

function markAllRead() {
  notifications.value.forEach(n => n.isRead = true)
}

function getIcon(type: string) {
  switch (type) {
    case 'success': return CheckCircle2
    case 'info': return Upload
    case 'warning': return AlertTriangle
    case 'error': return XCircle
    default: return Bell
  }
}
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

/* Panel */
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
}

.panel-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}

.mark-all-btn {
  font-size: 0.75rem;
  color: var(--color-primary);
  font-weight: 500;
  transition: opacity 0.15s ease;
}
.mark-all-btn:hover {
  opacity: 0.7;
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

.success-wrap { background: var(--color-success-light); color: var(--color-success); }
.info-wrap { background: var(--color-primary-light); color: var(--color-primary); }
.warning-wrap { background: var(--color-warning-light); color: #B45309; }
.error-wrap { background: var(--color-danger-light); color: var(--color-danger); }

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
}

.bell-overlay {
  position: fixed;
  inset: 0;
  z-index: 49;
}

/* Transition */
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
</style>
