import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
    const jobId = getRouterParam(event, 'jobId') as string | undefined
    if (!jobId) {
        throw createError({ statusCode: 400, message: 'jobId가 필요합니다.' })
    }

    const config = useRuntimeConfig()
    const supabase = createClient(
        config.public.supabaseUrl as string,
        config.public.supabaseKey as string
    )

    // 사용자 인증
    const authHeader = getHeader(event, 'authorization') || ''
    const accessToken = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken)
    if (authErr || !user) {
        throw createError({ statusCode: 401, message: '로그인이 필요합니다.' })
    }

    const { data: job, error } = await supabase
        .from('automation_jobs')
        .select('id, status, total_urls, success_count, fail_count, download_url, expires_at, summary_json, completed_at, created_at')
        .eq('id', jobId)
        .eq('created_by', user.id)
        .single()

    if (error || !job) {
        throw createError({ statusCode: 404, message: 'job을 찾을 수 없습니다.' })
    }

    // 다운로드 URL 만료 확인
    const isExpired = job.expires_at ? new Date(job.expires_at) < new Date() : false

    return {
        jobId: job.id,
        status: job.status,
        totalUrls: job.total_urls,
        successCount: job.success_count,
        failCount: job.fail_count,
        downloadUrl: isExpired ? null : job.download_url,
        isExpired,
        expiresAt: job.expires_at,
        failures: (job.summary_json as any)?.failures || [],
        completedAt: job.completed_at,
        createdAt: job.created_at
    }
})
