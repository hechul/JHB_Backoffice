import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
    const jobId = getRouterParam(event, 'jobId')
    if (!jobId) {
        throw createError({ statusCode: 400, message: 'jobId가 필요합니다.' })
    }

    // service_role 키로 조회 (SPA ssr:false 환경에서 세션 쿠키 없음)
    const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_KEY!

    if (!serviceKey) {
        throw createError({ statusCode: 500, message: 'SUPABASE_SERVICE_KEY 환경변수가 설정되지 않았습니다.' })
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false }
    })

    const { data: job, error } = await adminClient
        .from('automation_jobs')
        .select('id, status, total_urls, success_count, fail_count, storage_path, download_url, expires_at, summary_json, completed_at, created_at')
        .eq('id', jobId)
        .single()

    if (error || !job) {
        throw createError({ statusCode: 404, message: 'job을 찾을 수 없습니다.' })
    }

    const storagePath = String((job as any).storage_path || '')
    const summary = (job.summary_json && typeof job.summary_json === 'object') ? (job.summary_json as any) : {}
    const rawZipParts = Array.isArray(summary.zip_parts) ? summary.zip_parts : []
    // 다운로드 URL 만료 확인
    const isExpired = job.expires_at ? new Date(job.expires_at as string) < new Date() : false
    const availableZipParts = rawZipParts.filter((part: any) => String(part?.path || '').trim().length > 0)
    const downloadFiles = !isExpired
        ? availableZipParts.map((part: any, idx: number) => {
            const id = String(part?.id || `part-${idx + 1}`)
            return {
                id,
                label: `ZIP ${idx + 1}`,
                url: `/api/blog/download/${job.id}?part=${encodeURIComponent(id)}`,
                fileCount: Number(part?.fileCount || 0),
                sizeBytes: Number(part?.sizeBytes || 0),
            }
        })
        : []

    const hasLegacySingle = Boolean(storagePath) && !isExpired && downloadFiles.length === 0
    const proxyDownloadUrl = hasLegacySingle ? `/api/blog/download/${job.id}` : (downloadFiles[0]?.url || null)

    return {
        jobId: job.id,
        status: job.status,
        totalUrls: job.total_urls,
        successCount: job.success_count,
        failCount: job.fail_count,
        // 보안/정리 일관성을 위해 스토리지 signed URL 대신 서버 프록시 다운로드 URL 사용
        downloadUrl: proxyDownloadUrl,
        downloadFiles,
        isExpired,
        expiresAt: job.expires_at,
        failures: summary?.failures || [],
        completedAt: job.completed_at,
        createdAt: job.created_at
    }
})
