import { ref, computed, onMounted, onUnmounted } from 'vue'

export interface BatchProgress {
    totalUrls: number
    processedCount: number
    successCount: number
    failCount: number
    currentUrl: string
    failures: Array<{ url: string; reason: string }>
}

interface PersistedBatchState {
    isRunning: boolean
    isDone: boolean
    isPolling: boolean
    errorMessage: string
    progress: BatchProgress
    queue: string[]
    currentJobId: string | null
    pollStartTime: number
    updatedAt: number
}

export function useBlogMediaCollector() {
    const STORAGE_KEY = 'jh_blog_media_batch_state_v1'
    const isRunning = ref(false)
    const isDone = ref(false)
    const isPolling = ref(false)
    const errorMessage = ref('')

    const progress = ref<BatchProgress>({
        totalUrls: 0,
        processedCount: 0,
        successCount: 0,
        failCount: 0,
        currentUrl: '',
        failures: []
    })

    let pollTimer: ReturnType<typeof setInterval> | null = null
    const pollStartTime = ref(0)
    const queue = ref<string[]>([])
    const currentJobId = ref<string | null>(null)
    const POLL_INTERVAL_MS = 3000
    const MAX_POLL_DURATION_MS = 30 * 60 * 1000 // 30분

    function cloneProgress(raw?: Partial<BatchProgress> | null): BatchProgress {
        return {
            totalUrls: Number(raw?.totalUrls || 0),
            processedCount: Number(raw?.processedCount || 0),
            successCount: Number(raw?.successCount || 0),
            failCount: Number(raw?.failCount || 0),
            currentUrl: String(raw?.currentUrl || ''),
            failures: Array.isArray(raw?.failures)
                ? raw!.failures
                    .map((item: any) => ({
                        url: String(item?.url || ''),
                        reason: String(item?.reason || ''),
                    }))
                    .filter((item) => item.url || item.reason)
                : []
        }
    }

    function clearPersistedState() {
        if (!import.meta.client) return
        try {
            localStorage.removeItem(STORAGE_KEY)
        } catch { /* noop */ }
    }

    function persistState() {
        if (!import.meta.client) return

        const hasActiveState = isRunning.value
            || isDone.value
            || isPolling.value
            || Boolean(currentJobId.value)
            || queue.value.length > 0
            || progress.value.processedCount > 0
            || progress.value.totalUrls > 0
            || progress.value.failures.length > 0
            || Boolean(errorMessage.value)

        if (!hasActiveState) {
            clearPersistedState()
            return
        }

        const snapshot: PersistedBatchState = {
            isRunning: isRunning.value,
            isDone: isDone.value,
            isPolling: isPolling.value,
            errorMessage: errorMessage.value,
            progress: cloneProgress(progress.value),
            queue: [...queue.value],
            currentJobId: currentJobId.value,
            pollStartTime: pollStartTime.value,
            updatedAt: Date.now(),
        }

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
        } catch { /* noop */ }
    }

    function restorePersistedState(): boolean {
        if (!import.meta.client) return false

        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (!raw) return false

            const parsed = JSON.parse(raw) as Partial<PersistedBatchState>
            progress.value = cloneProgress(parsed.progress)
            isRunning.value = Boolean(parsed.isRunning)
            isDone.value = Boolean(parsed.isDone)
            isPolling.value = Boolean(parsed.isPolling)
            errorMessage.value = String(parsed.errorMessage || '')
            queue.value = Array.isArray(parsed.queue)
                ? parsed.queue.map((item) => String(item || '')).filter(Boolean)
                : []
            currentJobId.value = parsed.currentJobId ? String(parsed.currentJobId) : null
            pollStartTime.value = Number(parsed.pollStartTime || 0)
            return true
        } catch {
            clearPersistedState()
            return false
        }
    }

    function clearPoll() {
        if (pollTimer) {
            clearInterval(pollTimer)
            pollTimer = null
        }
    }

    function reset() {
        clearPoll()
        isRunning.value = false
        isDone.value = false
        isPolling.value = false
        errorMessage.value = ''
        queue.value = []
        currentJobId.value = null
        pollStartTime.value = 0
        progress.value = {
            totalUrls: 0,
            processedCount: 0,
            successCount: 0,
            failCount: 0,
            currentUrl: '',
            failures: []
        }
        clearPersistedState()
    }

    // 다운로드 유틸리티
    function safeFileName(name: string): string {
        return String(name || 'blog_media.zip').replace(/[\\/:*?"<>|]/g, '_')
    }

    function extractFilenameFromDisposition(contentDisposition: string | null): string | null {
        const raw = String(contentDisposition || '').trim()
        if (!raw) return null
        const utf8Matched = raw.match(/filename\*=UTF-8''([^;]+)/i)
        if (utf8Matched?.[1]) {
            try { return decodeURIComponent(utf8Matched[1]) } catch { /* noop */ }
        }
        const quoted = raw.match(/filename="([^"]+)"/i)
        if (quoted?.[1]) return quoted[1]
        const plain = raw.match(/filename=([^;]+)/i)
        if (plain?.[1]) return plain[1].trim()
        return null
    }

    function buildDownloadApiUrl(jobId: string, fileObj?: { id?: string }) {
        const partId = String(fileObj?.id || '').trim()
        if (partId && partId !== 'legacy') {
            return `/api/blog/download/${jobId}?part=${encodeURIComponent(partId)}`
        }
        return `/api/blog/download/${jobId}`
    }

    async function downloadAndCleanup(fileObj: { id: string, url: string, label?: string }, jobId: string) {
        try {
            const url = buildDownloadApiUrl(jobId, fileObj)
            const fallbackName = `${fileObj.label || 'blog_media'}.zip`
            const response = await fetch(url, {
                method: 'GET',
                mode: 'same-origin',
                credentials: 'include',
                cache: 'no-store',
            })

            if (!response.ok) throw new Error(`다운로드 실패 (${response.status})`)

            const blob = await response.blob()
            if (!blob || blob.size <= 0) throw new Error('다운로드 파일이 비어 있습니다.')

            const filename = safeFileName(
                extractFilenameFromDisposition(response.headers.get('content-disposition')) || fallbackName
            )

            const objectUrl = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = objectUrl
            link.download = filename
            document.body.appendChild(link)
            link.click()
            link.remove()
            // 브라우저 다운로드 시작 전에 revoke되면 간헐적으로 저장이 누락될 수 있어 지연 해제한다.
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)

        } catch (e: any) {
            console.error('[downloadAndCleanup] Error:', e)
            throw e
        }
    }

    async function handleJobComplete(data: any) {
        clearPoll()
        isPolling.value = false
        currentJobId.value = null
        pollStartTime.value = 0

        let successInThisJob = false
        // 이미 처리된 URL 수에 1을 더하면 이번 다운로드 대상 URL의 순번입니다.
        const currentUrlOrder = progress.value.processedCount + 1

        if (data.status === 'done' || data.status === 'partial') {
            const files = data.downloadFiles || []
            let downloaded = 0
            for (const [fileIndex, file] of files.entries()) {
                try {
                    // URL 순번 기준으로 ZIP 이름을 맞춥니다.
                    // 예: 첫 번째 URL은 1-1, 1-2 / 두 번째 URL은 2 또는 2-1
                    const label = files.length > 1
                        ? `${currentUrlOrder}-${fileIndex + 1}`
                        : `${currentUrlOrder}`
                    await downloadAndCleanup({ ...file, label }, data.jobId)
                    downloaded++
                } catch (e) {
                    // 다운로드 중 실패
                }
            }
            if (downloaded > 0) {
                successInThisJob = true
            } else if (data.status === 'done') {
                if (data.downloadUrl) {
                    try {
                        await downloadAndCleanup({
                            id: 'legacy',
                            url: data.downloadUrl,
                            label: `${currentUrlOrder}`
                        }, data.jobId)
                        successInThisJob = true
                    } catch (e) { }
                }
            }
        }

        if (successInThisJob) {
            progress.value.successCount++
        } else {
            const reason = data.failures?.[0]?.reason || '다운로드 실패 또는 미디어 없음'
            progress.value.failures.push({ url: progress.value.currentUrl, reason })
            progress.value.failCount++
        }

        progress.value.processedCount++
        persistState()
        setTimeout(processNext, 1500)
    }

    async function pollStatus() {
        if (!currentJobId.value) return

        if (Date.now() - pollStartTime.value > MAX_POLL_DURATION_MS) {
            clearPoll()
            isPolling.value = false
            progress.value.failures.push({ url: progress.value.currentUrl, reason: '타임아웃' })
            progress.value.failCount++
            progress.value.processedCount++
            currentJobId.value = null
            pollStartTime.value = 0
            persistState()
            setTimeout(processNext, 1000)
            return
        }

        try {
            const data = await $fetch<any>(`/api/blog/status/${currentJobId.value}`)
            const done = ['done', 'partial', 'failed'].includes(data.status)
            if (done) {
                await handleJobComplete(data)
            }
        } catch (err: any) {
            console.error('[useBlogMediaCollector] 폴링 오류:', err)
        }
    }

    async function processNext() {
        if (queue.value.length === 0) {
            isRunning.value = false
            isDone.value = true
            isPolling.value = false
            currentJobId.value = null
            pollStartTime.value = 0
            persistState()
            return
        }

        const nextUrl = queue.value.shift()!
        progress.value.currentUrl = nextUrl
        currentJobId.value = null
        pollStartTime.value = 0
        persistState()

        try {
            const result = await $fetch<{ jobId: string; totalUrls: number; status: string }>(
                '/api/blog/start',
                {
                    method: 'POST',
                    body: { urls: [nextUrl] }
                }
            )

            currentJobId.value = result.jobId
            isPolling.value = true
            pollStartTime.value = Date.now()
            persistState()
            pollTimer = setInterval(pollStatus, POLL_INTERVAL_MS)
            await pollStatus()
        } catch (err: any) {
            progress.value.failures.push({ url: nextUrl, reason: '작업시작실패' })
            progress.value.failCount++
            progress.value.processedCount++
            persistState()
            setTimeout(processNext, 1000)
        }
    }

    async function startBatch(urls: string[]) {
        reset()
        if (!urls || urls.length === 0) return

        isRunning.value = true
        queue.value = [...urls]
        progress.value.totalUrls = urls.length
        persistState()

        await processNext()
    }

    async function resumeBatch() {
        const restored = restorePersistedState()
        if (!restored) return

        if (isRunning.value && currentJobId.value) {
            clearPoll()
            isPolling.value = true
            persistState()
            pollTimer = setInterval(pollStatus, POLL_INTERVAL_MS)
            await pollStatus()
            return
        }

        if (isRunning.value && queue.value.length > 0) {
            setTimeout(() => {
                void processNext()
            }, 0)
            return
        }

        if (isRunning.value && !currentJobId.value && queue.value.length === 0) {
            isRunning.value = false
            isDone.value = progress.value.totalUrls > 0
            persistState()
        }
    }

    const statusLabel = computed(() => {
        if (isDone.value) return '모든 작업 완료'
        if (!isRunning.value) return '대기 중'
        return `(${progress.value.processedCount + 1}/${progress.value.totalUrls}) 처리 및 자동 다운로드 중...`
    })

    const statusVariant = computed(() => {
        if (isDone.value) return progress.value.failCount === 0 ? 'success' : 'warning'
        if (isRunning.value) return 'info'
        return 'neutral'
    })

    onMounted(() => {
        void resumeBatch()
    })

    onUnmounted(() => clearPoll())

    return {
        isRunning,
        isDone,
        isPolling,
        progress,
        errorMessage,
        statusLabel,
        statusVariant,
        startBatch,
        reset
    }
}
