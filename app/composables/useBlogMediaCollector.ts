/**
 * 블로그 미디어 수집 흐름 제어 composable
 * job 등록 → 폴링 → 완료 감지 → 다운로드 URL 반환
 * @nuxtjs/supabase 쿠키 기반 인증 사용 (별도 Authorization 헤더 불필요)
 */

export interface JobStatus {
    jobId: string
    status: 'pending' | 'running' | 'done' | 'partial' | 'failed'
    totalUrls: number
    successCount: number
    failCount: number
    downloadUrl: string | null
    downloadFiles?: Array<{
        id: string
        label: string
        url: string
        fileCount?: number
        sizeBytes?: number
    }>
    isExpired: boolean
    expiresAt: string | null
    failures: Array<{ url: string; reason: string }>
    completedAt: string | null
    createdAt: string | null
}

const POLL_INTERVAL_MS = 3000
const MAX_POLL_DURATION_MS = 30 * 60 * 1000 // 30분 (다건/동영상 포함 대용량 작업 대응)

export function useBlogMediaCollector() {
    const isStarting = ref(false)
    const isPolling = ref(false)
    const currentJob = ref<JobStatus | null>(null)
    const errorMessage = ref('')
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let pollStartTime = 0

    function clearPoll() {
        if (pollTimer) {
            clearInterval(pollTimer)
            pollTimer = null
        }
    }

    function reset() {
        clearPoll()
        isStarting.value = false
        isPolling.value = false
        currentJob.value = null
        errorMessage.value = ''
    }

    async function pollStatus(jobId: string) {
        if (Date.now() - pollStartTime > MAX_POLL_DURATION_MS) {
            clearPoll()
            isPolling.value = false
            errorMessage.value = '처리 시간이 길어지고 있습니다. 잠시 후 다시 상태를 확인해 주세요.'
            return
        }

        try {
            const data = await $fetch<JobStatus>(`/api/blog/status/${jobId}`)
            currentJob.value = data

            const done = ['done', 'partial', 'failed'].includes(data.status)
            if (done) {
                clearPoll()
                isPolling.value = false
            }
        } catch (err: any) {
            console.error('[useBlogMediaCollector] 폴링 오류:', err)
        }
    }

    async function startJob(urls: string[]) {
        reset()
        isStarting.value = true
        errorMessage.value = ''

        try {
            const result = await $fetch<{ jobId: string; totalUrls: number; status: string }>(
                '/api/blog/start',
                {
                    method: 'POST',
                    body: { urls }
                }
            )

            currentJob.value = {
                jobId: result.jobId,
                status: 'pending',
                totalUrls: result.totalUrls,
                successCount: 0,
                failCount: 0,
                downloadUrl: null,
                downloadFiles: [],
                isExpired: false,
                expiresAt: null,
                failures: [],
                completedAt: null,
                createdAt: new Date().toISOString()
            }

            // 폴링 시작
            isPolling.value = true
            pollStartTime = Date.now()
            pollTimer = setInterval(() => pollStatus(result.jobId), POLL_INTERVAL_MS)

        } catch (err: any) {
            errorMessage.value = err?.data?.message || err?.message || '작업 시작 실패'
        } finally {
            isStarting.value = false
        }
    }

    const statusLabel = computed(() => {
        const s = currentJob.value?.status
        if (!s) return ''
        const map: Record<string, string> = {
            pending: '서버 준비 중 (최대 90초)...',
            running: '수집 중... (URL당 약 1~2분 소요)',
            done: '완료',
            partial: '일부 완료',
            failed: '실패'
        }
        return map[s] || s
    })

    const isInProgress = computed(() =>
        ['pending', 'running'].includes(currentJob.value?.status || '')
    )

    const isDone = computed(() =>
        ['done', 'partial', 'failed'].includes(currentJob.value?.status || '')
    )

    // cleanup
    onUnmounted(() => clearPoll())

    return {
        isStarting,
        isPolling,
        currentJob,
        errorMessage,
        statusLabel,
        isInProgress,
        isDone,
        startJob,
        reset
    }
}
