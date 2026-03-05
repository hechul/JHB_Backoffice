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

let isProcessing = false

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
    const results = []
    const failures = []

    // 2. 각 URL 크롤링
    for (const url of urls) {
        try {
            const mediaUrls = await extractBlogMedia(url)
            if (mediaUrls.length === 0) {
                failures.push({ url, reason: '미디어_없음' })
            } else {
                results.push({ url, mediaUrls })
            }
        } catch (err) {
            console.error(`[worker] 크롤링 실패 url=${url}`, err.message)
            const reason = err.message?.includes('timeout') ? '타임아웃' :
                err.message?.includes('net::') ? '접근불가' : '파싱실패'
            failures.push({ url, reason })
        }
    }

    // 3. ZIP 생성 및 업로드
    let storagePath = null
    let downloadUrl = null
    const successCount = results.length
    const failCount = failures.length

    if (successCount > 0) {
        try {
            const zipBuffer = await createZip(results)
            const uploadResult = await uploadZipToStorage(supabase, jobId, zipBuffer)
            storagePath = uploadResult.path
            downloadUrl = uploadResult.signedUrl
        } catch (err) {
            console.error(`[worker] ZIP 업로드 실패 job=${jobId}`, err.message)
        }
    }

    // 4. 최종 상태 업데이트
    const finalStatus = failCount === 0 ? 'done' : successCount === 0 ? 'failed' : 'partial'
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await supabase
        .from('automation_jobs')
        .update({
            status: finalStatus,
            success_count: successCount,
            fail_count: failCount,
            storage_path: storagePath,
            download_url: downloadUrl,
            expires_at: storagePath ? expiresAt : null,
            summary_json: {
                urls,
                failures,
                results: results.map(r => ({ url: r.url, count: r.mediaUrls.length }))
            },
            completed_at: new Date().toISOString()
        })
        .eq('id', jobId)

    console.log(`[worker] 완료 job=${jobId} status=${finalStatus} success=${successCount} fail=${failCount}`)
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
