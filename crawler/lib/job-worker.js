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
const MAX_ZIP_PART_MB = Math.max(20, Math.min(Number.parseInt(process.env.BLOG_MAX_ZIP_PART_MB || '120', 10) || 120, 200))
const MAX_ZIP_PART_BYTES = MAX_ZIP_PART_MB * 1024 * 1024
const BASE_IMAGE_QUALITY = 'w2000'
const STALE_RUNNING_JOB_MS = Math.max(10, Math.min(Number.parseInt(process.env.BLOG_STALE_RUNNING_JOB_MINUTES || '20', 10) || 20, 180)) * 60 * 1000

let isProcessing = false

function safePathSegment(value) {
    return String(value || '')
        .trim()
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80)
}

function isVideoUrl(url) {
    return /mblogvideo|\.mp4($|\?)|type=mp4|\/video\//i.test(String(url || ''))
}

function getChunkKind(mediaUrls) {
    const list = Array.isArray(mediaUrls) ? mediaUrls.filter(Boolean) : []
    if (list.length === 0) return 'media'

    const videoCount = list.filter(isVideoUrl).length
    if (videoCount === list.length) return 'video'
    if (videoCount === 0) return 'images'
    return 'images_videos'
}

function buildBlogZipFileName(blogIndex, chunkIndex, chunkTotal) {
    const blogName = `blog_${String(blogIndex + 1).padStart(2, '0')}`
    if (chunkTotal <= 1) return `${blogName}.zip`
    return `${blogName}-${chunkIndex}.zip`
}

function buildBlogZipPath(jobId, blogIndex, chunkIndex, chunkTotal) {
    return `${jobId}/${buildBlogZipFileName(blogIndex, chunkIndex, chunkTotal)}`
}

async function splitZipByMediaCount(url, mediaUrls, firstZipBuffer = null) {
    const chunks = []
    const dropped = []

    async function splitRecursive(list, knownZipBuffer = null) {
        if (!Array.isArray(list) || list.length === 0) return

        const zipBuffer = knownZipBuffer || await createZip([{ url, mediaUrls: list }])
        if (zipBuffer.length <= MAX_ZIP_PART_BYTES) {
            chunks.push({
                mediaUrls: list,
                zipBuffer,
                kind: getChunkKind(list),
            })
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

    await splitRecursive(mediaUrls, firstZipBuffer)
    return { chunks, dropped }
}

async function buildZipChunksForResult(url, mediaUrls) {
    if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) {
        return { chunks: [], droppedCount: 0, usedQuality: BASE_IMAGE_QUALITY }
    }

    const usedQuality = BASE_IMAGE_QUALITY
    const zipBuffer = await createZip([{ url, mediaUrls }])

    if (zipBuffer.length <= MAX_ZIP_PART_BYTES) {
        return {
            chunks: [{
                mediaUrls,
                zipBuffer,
                kind: getChunkKind(mediaUrls),
            }],
            droppedCount: 0,
            usedQuality,
        }
    }

    const split = await splitZipByMediaCount(url, mediaUrls, zipBuffer)
    return {
        chunks: split.chunks,
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

async function markJobFailed(supabase, job, reason) {
    const summary = (job?.summary_json && typeof job.summary_json === 'object')
        ? { ...(job.summary_json) }
        : {}
    const urls = Array.isArray(summary.urls) ? summary.urls.filter(Boolean) : []
    const failures = Array.isArray(summary.failures) ? [...summary.failures] : []

    if (failures.length === 0) {
        if (urls.length > 0) {
            failures.push(...urls.map((url) => ({ url, reason })))
        } else {
            failures.push({ url: '', reason })
        }
    }

    await supabase
        .from('automation_jobs')
        .update({
            status: 'failed',
            fail_count: Math.max(Number(job?.fail_count || 0), failures.length || 1),
            summary_json: {
                ...summary,
                failures,
            },
            completed_at: new Date().toISOString(),
        })
        .eq('id', job.id)
}

async function reclaimStaleRunningJobs(supabase) {
    const cutoffIso = new Date(Date.now() - STALE_RUNNING_JOB_MS).toISOString()
    const { data: staleJobs, error } = await supabase
        .from('automation_jobs')
        .select('id, job_type, status, fail_count, summary_json, created_at')
        .eq('job_type', 'blog_media')
        .eq('status', 'running')
        .lt('created_at', cutoffIso)

    if (error) {
        console.error('[worker] stale job 조회 오류:', error.message)
        return
    }

    for (const staleJob of staleJobs || []) {
        console.warn(`[worker] stale running job 정리: job=${staleJob.id} created_at=${staleJob.created_at}`)
        await markJobFailed(supabase, staleJob, '워커중단')
    }
}

async function processPendingJob(supabase, job) {
    const jobId = job.id
    console.log(`[worker] 처리 시작 job=${jobId}`)
    try {
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
                    resultsWithOrder[index] = { index, url, mediaUrls }
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

        let storagePath = null
        let downloadUrl = null
        const zipParts = []
        const successfulUrls = new Set()

        if (results.length > 0) {
            for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
                const result = results[resultIndex]
                const blogIndex = Number.isInteger(result.index) ? result.index : resultIndex
                try {
                    const prepared = await buildZipChunksForResult(result.url, result.mediaUrls)
                    if (!prepared.chunks.length) {
                        normalizedFailures.push({ url: result.url, reason: '용량초과' })
                        continue
                    }

                    if (prepared.droppedCount > 0) {
                        normalizedFailures.push({ url: result.url, reason: '용량초과(일부제외)' })
                    }

                    const chunkTotal = prepared.chunks.length
                    for (let chunkOffset = 0; chunkOffset < prepared.chunks.length; chunkOffset += 1) {
                        const chunk = prepared.chunks[chunkOffset]
                        const chunkIndex = chunkOffset + 1
                        const blogNo = String(blogIndex + 1).padStart(2, '0')
                        const partId = chunkTotal <= 1
                            ? `blog-${blogNo}`
                            : `blog-${blogNo}-${String(chunkIndex).padStart(2, '0')}`
                        const label = chunkTotal <= 1
                            ? `블로그 ${blogIndex + 1}`
                            : `블로그 ${blogIndex + 1}-${chunkIndex}`
                        const filename = buildBlogZipPath(jobId, blogIndex, chunkIndex, chunkTotal)
                        const uploadResult = await uploadZipToStorage(supabase, jobId, chunk.zipBuffer, { filename })
                        zipParts.push({
                            id: partId,
                            label,
                            path: uploadResult.path,
                            sourceUrl: result.url,
                            fileCount: Array.isArray(chunk.mediaUrls) ? chunk.mediaUrls.length : 0,
                            sizeBytes: chunk.zipBuffer.length,
                            quality: prepared.usedQuality,
                            sourceChunkIndex: chunkIndex,
                            sourceChunkTotal: chunkTotal,
                        })
                    }
                    successfulUrls.add(result.url)
                } catch (err) {
                    console.error(`[worker] ZIP 업로드 실패 job=${jobId} url=${result.url}`, err?.message || err)
                    normalizedFailures.push({ url: result.url, reason: 'ZIP업로드실패' })
                }
            }
            storagePath = zipParts[0]?.path || null
        }

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
    } catch (err) {
        console.error(`[worker] 예상치 못한 job 실패 job=${jobId}:`, err?.message || err)
        await markJobFailed(supabase, job, '처리중단')
    }
}

async function pollAndProcess() {
    if (isProcessing) return

    const supabase = createSupabaseServiceClient()

    try {
        await reclaimStaleRunningJobs(supabase)

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
