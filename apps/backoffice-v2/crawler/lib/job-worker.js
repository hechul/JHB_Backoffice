/**
 * Supabase DB 폴링 워커
 * 5초마다 pending 상태의 job을 조회해서 크롤링 실행
 */
const { createClient } = require('@supabase/supabase-js')
const { extractBlogMedia } = require('./naver-parser')
const { createZip } = require('./zipper')
const { uploadZipToStorage } = require('./supabase-uploader')

const POLL_INTERVAL_MS = 5000
const MAX_CONCURRENT_JOBS = 1 // 무료 플랜 RAM 512MB 대응
const URL_CONCURRENCY = Math.max(1, Math.min(Number.parseInt(process.env.BLOG_URL_CONCURRENCY || '2', 10) || 2, 4))
const EXTRACT_RETRY_COUNT = Math.max(1, Math.min(Number.parseInt(process.env.BLOG_EXTRACT_RETRY_COUNT || '3', 10) || 3, 5))
const EXTRACT_RETRY_BACKOFF_MS = 1200
const MAX_ZIP_PART_MB = Math.max(10, Math.min(Number.parseInt(process.env.BLOG_MAX_ZIP_PART_MB || '45', 10) || 45, 100))
const MAX_ZIP_PART_BYTES = MAX_ZIP_PART_MB * 1024 * 1024
const BASE_IMAGE_QUALITY = 'w2000'

let isProcessing = false

async function splitZipByMediaCount(url, mediaUrls, maxBytes) {
    const fitChunks = []
    const dropped = []

    async function splitRecursive(list) {
        if (!Array.isArray(list) || list.length === 0) return
        const zipBuffer = await createZip([{ url, mediaUrls: list }])
        if (zipBuffer.length <= maxBytes) {
            fitChunks.push({ mediaUrls: list, zipBuffer })
            return
        }
        if (list.length <= 1) {
            dropped.push(list[0])
            return
        }
        const mid = Math.ceil(list.length / 2)
        await splitRecursive(list.slice(0, mid))
        await splitRecursive(list.slice(mid))
    }

    await splitRecursive(mediaUrls)
    return { fitChunks, dropped }
}

async function buildZipChunksForResult(url, mediaUrls) {
    if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) {
        return { chunks: [], droppedCount: 0, usedQuality: BASE_IMAGE_QUALITY }
    }

    const usedQuality = BASE_IMAGE_QUALITY
    const bestZip = await createZip([{ url, mediaUrls }])

    if (bestZip.length <= MAX_ZIP_PART_BYTES) {
        return {
            chunks: [{ mediaUrls, zipBuffer: bestZip }],
            droppedCount: 0,
            usedQuality,
        }
    }

    const split = await splitZipByMediaCount(url, mediaUrls, MAX_ZIP_PART_BYTES)
    return {
        chunks: split.fitChunks,
        droppedCount: split.dropped.length,
        usedQuality,
    }
}

function createSupabaseServiceClient() {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY not set')
    return createClient(url, key, {
        auth: { persistSession: false }
    })
}

async function processPendingJob(supabase, job) {
    const jobId = job.id
    console.log(`[worker] 처리 시작 job=${jobId}`)

    // 1. status: running 업데이트
    await supabase
        .from('automation_jobs')
        .update({ status: 'running' })
        .eq('id', jobId)

    const urls = job.summary_json?.urls || []
    const resultsWithOrder = new Array(urls.length)
    const failures = []

    function mapFailureReason(err) {
        const message = String(err?.message || '').toLowerCase()
        if (message.includes('timeout')) return '타임아웃'
        if (message.includes('net::') || message.includes('name_not_resolved') || message.includes('dns')) return '접근불가'
        return '파싱실패'
    }

    async function extractWithRetry(url, index) {
        let lastError = null
        for (let attempt = 1; attempt <= EXTRACT_RETRY_COUNT; attempt += 1) {
            try {
                const mediaUrls = await extractBlogMedia(url)
                if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) {
                    failures.push({ index, url, reason: '미디어_없음' })
                    return
                }
                resultsWithOrder[index] = { url, mediaUrls }
                return
            } catch (err) {
                lastError = err
                const reason = mapFailureReason(err)
                const finalAttempt = attempt >= EXTRACT_RETRY_COUNT
                if (finalAttempt) {
                    console.error(`[worker] 크롤링 실패 url=${url} attempt=${attempt} reason=${reason}`, err?.message || err)
                    failures.push({ index, url, reason })
                    return
                }
                const waitMs = EXTRACT_RETRY_BACKOFF_MS * attempt
                console.warn(`[worker] 크롤링 재시도 url=${url} attempt=${attempt}/${EXTRACT_RETRY_COUNT} wait=${waitMs}ms`)
                await new Promise((resolve) => setTimeout(resolve, waitMs))
            }
        }
        const fallbackReason = mapFailureReason(lastError || {})
        failures.push({ index, url, reason: fallbackReason })
    }

    // 2. 각 URL 크롤링 (제한 병렬)
    let cursor = 0
    async function runUrlWorker() {
        while (cursor < urls.length) {
            const index = cursor
            cursor += 1
            const url = urls[index]
            if (!url) continue
            await extractWithRetry(url, index)
        }
    }

    await Promise.all(Array.from({ length: Math.min(URL_CONCURRENCY, Math.max(urls.length, 1)) }, () => runUrlWorker()))

    const results = resultsWithOrder.filter(Boolean)
    failures.sort((a, b) => a.index - b.index)
    const normalizedFailures = failures.map((item) => ({ url: item.url, reason: item.reason }))

    // 3. ZIP 생성 및 업로드 (URL별 파트 업로드)
    let storagePath = null
    let downloadUrl = null
    const zipParts = []
    const successfulUrls = new Set()

    if (results.length > 0) {
        let partNo = 1
        for (const result of results) {
            try {
                const prepared = await buildZipChunksForResult(result.url, result.mediaUrls)
                if (!prepared.chunks.length) {
                    normalizedFailures.push({ url: result.url, reason: '용량초과' })
                    continue
                }

                if (prepared.droppedCount > 0) {
                    normalizedFailures.push({ url: result.url, reason: '용량초과(일부제외)' })
                }

                let chunkIndex = 1
                for (const chunk of prepared.chunks) {
                    const zipBuffer = chunk.zipBuffer
                    const partId = `part-${String(partNo).padStart(2, '0')}`
                    const filename = `${jobId}/${partId}.zip`
                    const uploadResult = await uploadZipToStorage(supabase, jobId, zipBuffer, { filename })
                    zipParts.push({
                        id: partId,
                        path: uploadResult.path,
                        sourceUrl: result.url,
                        fileCount: Array.isArray(chunk.mediaUrls) ? chunk.mediaUrls.length : 0,
                        sizeBytes: zipBuffer.length,
                        quality: prepared.usedQuality,
                        sourceChunkIndex: chunkIndex,
                        sourceChunkTotal: prepared.chunks.length,
                    })
                    chunkIndex += 1
                    partNo += 1
                }
                successfulUrls.add(result.url)
            } catch (err) {
                console.error(`[worker] ZIP 업로드 실패 job=${jobId} url=${result.url}`, err?.message || err)
                normalizedFailures.push({ url: result.url, reason: 'ZIP업로드실패' })
            }
        }
        storagePath = zipParts[0]?.path || null
    }

    // 4. 최종 상태 업데이트
    const finalSuccessCount = successfulUrls.size
    const finalFailCount = normalizedFailures.length
    const finalStatus = finalFailCount === 0 ? 'done' : finalSuccessCount === 0 ? 'failed' : 'partial'
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await supabase
        .from('automation_jobs')
        .update({
            status: finalStatus,
            success_count: finalSuccessCount,
            fail_count: finalFailCount,
            storage_path: storagePath,
            download_url: downloadUrl,
            expires_at: storagePath ? expiresAt : null,
            summary_json: {
                urls,
                failures: normalizedFailures,
                results: results.map(r => ({ url: r.url, count: r.mediaUrls.length })),
                zip_parts: zipParts,
            },
            completed_at: new Date().toISOString()
        })
        .eq('id', jobId)

    console.log(`[worker] 완료 job=${jobId} status=${finalStatus} success=${finalSuccessCount} fail=${finalFailCount} parts=${zipParts.length}`)
}

async function pollAndProcess() {
    if (isProcessing) return

    const supabase = createSupabaseServiceClient()

    try {
        // pending job 1개 조회
        const { data: jobs, error } = await supabase
            .from('automation_jobs')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(MAX_CONCURRENT_JOBS)

        if (error) {
            console.error('[worker] DB 폴링 오류:', error.message)
            return
        }

        if (!jobs || jobs.length === 0) return

        isProcessing = true
        for (const job of jobs) {
            await processPendingJob(supabase, job)
        }
    } catch (err) {
        console.error('[worker] 처리 중 오류:', err.message)
    } finally {
        isProcessing = false
    }
}

function startWorker() {
    console.log(`[worker] DB 폴링 시작 (${POLL_INTERVAL_MS / 1000}초 간격)`)
    setInterval(pollAndProcess, POLL_INTERVAL_MS)
    // 시작 즉시 1회 실행
    pollAndProcess()
}

module.exports = { startWorker }
