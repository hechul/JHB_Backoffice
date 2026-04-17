import { ref, computed, onUnmounted } from 'vue'

export interface BatchProgress {
    totalUrls: number
    processedCount: number
    successCount: number
    failCount: number
    currentUrl: string
    failures: Array<{ url: string; reason: string }>
}

export function useBlogMediaCollector() {
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
    let pollStartTime = 0
    let queue: string[] = []
    let currentJobId: string | null = null
    const POLL_INTERVAL_MS = 3000
    const MAX_POLL_DURATION_MS = 30 * 60 * 1000 // 30분

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
        queue = []
        currentJobId = null
        progress.value = {
            totalUrls: 0,
            processedCount: 0,
            successCount: 0,
            failCount: 0,
            currentUrl: '',
            failures: []
        }
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

    async function downloadAndCleanup(fileObj: { id: string, url: string, label?: string }, jobId: string) {
        try {
            const url = fileObj.url
            const fallbackName = `${fileObj.label || 'blog_media'}.zip`

            const isAbsolute = /^https?:\/\//i.test(String(url || ''))
            const response = await fetch(url, {
                method: 'GET',
                mode: isAbsolute ? 'cors' : 'same-origin',
                credentials: isAbsolute ? 'omit' : 'include',
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
            URL.revokeObjectURL(objectUrl)

            // 다운로드 성공 후 즉시 cleanup 호출
            await $fetch(`/api/blog/cleanup/${jobId}`, {
                method: 'POST',
                body: { partId: fileObj.id }
            }).catch(e => console.error('[cleanup] Failed:', e))

        } catch (e: any) {
            console.error('[downloadAndCleanup] Error:', e)
            throw e
        }
    }

    async function handleJobComplete(data: any) {
        clearPoll()
        isPolling.value = false

        let successInThisJob = false
        // 현재 완료 처리 중인 URL의 순번입니다.
        // processedCount는 "이미 끝난 URL 수"라서, +1 하면 이번 URL이 몇 번째인지 계산할 수 있습니다.
        const currentUrlOrder = progress.value.processedCount + 1

        if (data.status === 'done' || data.status === 'partial') {
            const files = data.downloadFiles || []
            let downloaded = 0
            for (const [fileIndex, file] of files.entries()) {
                try {
                    // 하나의 블로그 URL에서 ZIP이 여러 개로 쪼개질 수 있으므로
                    // 1번째 URL은 1-1, 1-2 / 2번째 URL은 2 또는 2-1, 2-2 형태로 이름을 맞춥니다.
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
            // 실패 사유 추출
            const reason = data.failures?.[0]?.reason || '다운로드 실패 또는 미디어 없음'
            progress.value.failures.push({ url: progress.value.currentUrl, reason })
            progress.value.failCount++
        }

        progress.value.processedCount++
        setTimeout(processNext, 1500)
    }

    async function pollStatus() {
        if (!currentJobId) return

        if (Date.now() - pollStartTime > MAX_POLL_DURATION_MS) {
            clearPoll()
            isPolling.value = false
            progress.value.failures.push({ url: progress.value.currentUrl, reason: '타임아웃' })
            progress.value.failCount++
            progress.value.processedCount++
            setTimeout(processNext, 1000)
            return
        }

        try {
            const data = await $fetch<any>(`/api/blog/status/${currentJobId}`)
            const done = ['done', 'partial', 'failed'].includes(data.status)
            if (done) {
                await handleJobComplete(data)
            }
        } catch (err: any) {
            console.error('[useBlogMediaCollector] 폴링 오류:', err)
        }
    }

    async function processNext() {
        if (queue.length === 0) {
            isRunning.value = false
            isDone.value = true
            return
        }

        const nextUrl = queue.shift()!
        progress.value.currentUrl = nextUrl
        currentJobId = null

        try {
            const result = await $fetch<{ jobId: string; totalUrls: number; status: string }>(
                '/api/blog/start',
                {
                    method: 'POST',
                    body: { urls: [nextUrl] }
                }
            )

            currentJobId = result.jobId
            isPolling.value = true
            pollStartTime = Date.now()
            pollTimer = setInterval(pollStatus, POLL_INTERVAL_MS)
        } catch (err: any) {
            progress.value.failures.push({ url: nextUrl, reason: '작업시작실패' })
            progress.value.failCount++
            progress.value.processedCount++
            setTimeout(processNext, 1000)
        }
    }

    async function startBatch(urls: string[]) {
        reset()
        if (!urls || urls.length === 0) return

        isRunning.value = true
        queue = [...urls]
        progress.value.totalUrls = urls.length

        await processNext()
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
