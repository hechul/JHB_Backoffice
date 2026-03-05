import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
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
        .select('id, status, total_urls, success_count, fail_count, download_url, expires_at, summary_json, completed_at, created_at')
        .eq('id', jobId)
        .single()

    if (error || !job) {
        throw createError({ statusCode: 404, message: 'job을 찾을 수 없습니다.' })
    }

    // 다운로드 URL 만료 확인
    const isExpired = job.expires_at ? new Date(job.expires_at as string) < new Date() : false

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
