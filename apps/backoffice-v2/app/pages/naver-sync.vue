<template>
  <div class="sync-page">
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">주문 동기화</h1>
        <span class="page-caption">채널을 선택하고 바로 주문을 반영합니다.</span>
      </div>

      <div class="sync-channel-switch" role="tablist" aria-label="주문 동기화 채널 선택">
        <button
          v-for="option in syncChannelOptions"
          :key="option.value"
          type="button"
          class="sync-channel-chip"
          :class="{ active: selectedChannel === option.value }"
          :aria-selected="selectedChannel === option.value"
          @click="selectChannel(option.value)"
        >
          <span class="sync-channel-chip-label">{{ option.label }}</span>
          <span class="sync-channel-chip-meta">{{ option.meta }}</span>
        </button>
      </div>
    </div>

    <div class="sync-channel-hero">
      <div class="sync-channel-copy">
        <strong>{{ activeChannelInfo.title }}</strong>
        <span>{{ activeChannelInfo.description }}</span>
      </div>
      <StatusBadge :label="activeChannelInfo.badge" :variant="activeChannelInfo.badgeVariant" />
    </div>

    <NaverSyncPanel v-if="selectedChannel === 'naver'" />
    <CoupangSyncPanel v-else />
  </div>
</template>

<script setup lang="ts">
type SyncChannel = 'naver' | 'coupang'

interface SyncChannelOption {
  value: SyncChannel
  label: string
  meta: string
  title: string
  description: string
  badge: string
  badgeVariant: 'primary' | 'success'
}

const route = useRoute()
const router = useRouter()

const syncChannelOptions: SyncChannelOption[] = [
  {
    value: 'naver',
    label: '네이버',
    meta: 'Commerce API',
    title: '네이버 주문 동기화',
    description: '선택한 기간의 네이버 주문을 확인하고 실구매 데이터에 반영합니다.',
    badge: '네이버',
    badgeVariant: 'primary',
  },
  {
    value: 'coupang',
    label: '쿠팡',
    meta: 'Raw line sync',
    title: '쿠팡 주문 동기화',
    description: '쿠팡 주문 raw line을 적재하고 후속 분석 화면과 바로 연결합니다.',
    badge: '쿠팡',
    badgeVariant: 'success',
  },
]

function normalizeSyncChannel(value: unknown): SyncChannel {
  return value === 'coupang' ? 'coupang' : 'naver'
}

const selectedChannel = ref<SyncChannel>('naver')

const activeChannelInfo = computed(() => {
  return syncChannelOptions.find((option) => option.value === selectedChannel.value) || syncChannelOptions[0]
})

function currentQueryChannel() {
  const raw = route.query.channel
  return normalizeSyncChannel(Array.isArray(raw) ? raw[0] : raw)
}

async function syncChannelQuery(channel: SyncChannel) {
  const nextQuery = { ...route.query } as Record<string, string | string[] | undefined>
  if (channel === 'naver') {
    delete nextQuery.channel
  } else {
    nextQuery.channel = channel
  }

  await router.replace({
    path: '/naver-sync',
    query: nextQuery,
  })
}

async function selectChannel(channel: SyncChannel) {
  if (selectedChannel.value === channel) return
  selectedChannel.value = channel
  await syncChannelQuery(channel)
}

watch(
  () => route.query.channel,
  (value) => {
    const nextChannel = normalizeSyncChannel(Array.isArray(value) ? value[0] : value)
    if (selectedChannel.value !== nextChannel) {
      selectedChannel.value = nextChannel
    }
  },
  { immediate: true }
)

onMounted(async () => {
  const normalized = currentQueryChannel()
  if (normalized !== selectedChannel.value) {
    selectedChannel.value = normalized
  }
  if (normalized === 'naver' && typeof route.query.channel !== 'undefined') {
    await syncChannelQuery('naver')
  }
})
</script>

<style scoped>
.sync-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-lg);
}

.page-header-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.page-title {
  margin: 0;
  font-size: 1.9rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--color-text);
}

.page-caption {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.sync-channel-switch {
  display: inline-flex;
  align-items: stretch;
  gap: 10px;
  padding: 8px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}

.sync-channel-chip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 136px;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: 18px;
  background: transparent;
  color: var(--color-text-secondary);
  text-align: left;
  transition: background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
}

.sync-channel-chip:hover {
  background: rgba(248, 250, 253, 0.96);
  color: var(--color-text);
}

.sync-channel-chip.active {
  background: linear-gradient(180deg, rgba(238, 245, 255, 0.98) 0%, rgba(231, 240, 255, 0.96) 100%);
  border-color: rgba(49, 130, 246, 0.18);
  color: var(--color-text);
  box-shadow: 0 10px 24px rgba(49, 130, 246, 0.08);
}

.sync-channel-chip-label {
  font-size: 0.96rem;
  font-weight: 700;
}

.sync-channel-chip-meta {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.sync-channel-chip.active .sync-channel-chip-meta {
  color: var(--color-primary);
}

.sync-channel-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-lg);
  padding: 18px 20px;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(248, 250, 253, 0.96) 100%);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.sync-channel-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sync-channel-copy strong {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}

.sync-channel-copy span {
  font-size: 0.88rem;
  color: var(--color-text-muted);
}

@media (max-width: 960px) {
  .page-header,
  .sync-channel-hero {
    flex-direction: column;
    align-items: stretch;
  }

  .sync-channel-switch {
    width: 100%;
  }

  .sync-channel-chip {
    flex: 1;
    min-width: 0;
  }
}

@media (max-width: 640px) {
  .sync-channel-switch {
    flex-direction: column;
  }
}
</style>
