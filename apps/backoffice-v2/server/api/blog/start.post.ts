import { createClient } from '@supabase/supabase-js'
import { serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { urls } = body || {}

    // 입력 검증
    if (!Array.isArray(urls) || urls.length === 0) {
        throw createError({ statusCode: 400, message: 'urls 배열이 필요합니다.' })
    }
    if (urls.length > 10) {
        throw createError({ statusCode: 400, message: '최대 10개 URL까지 처리 가능합니다.' })
    }

    // URL 유효성 검사
    const validUrls = urls.filter(u => {
        try {
            const parsed = new URL(u)
            return parsed.hostname.includes('blog.naver.com')
        } catch { return false }
    })
    if (validUrls.length === 0) {
        throw createError({ statusCode: 400, message: '유효한 네이버 블로그 URL이 없습니다.' })
    }

    // 사용자 확인 (SPA ssr:false라서 세션이 없으면 null일 수 있음)
    const user = await serverSupabaseUser(event).catch(() => null)

    // service_role 키로 RLS 우회 (Vercel 서버 함수에서 직접 insert)
    const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_KEY!

    if (!serviceKey) {
        throw createError({ statusCode: 500, message: 'SUPABASE_SERVICE_KEY 환경변수가 설정되지 않았습니다.' })
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false }
    })

    // job 등록
    const { data: job, error: insertErr } = await adminClient
        .from('automation_jobs')
        .insert({
            job_type: 'blog_media',
            created_by: user?.id ?? null,
            status: 'pending',
            total_urls: validUrls.length,
            summary_json: { urls: validUrls }
        })
        .select('id')
        .single()

    if (insertErr || !job) {
        console.error('[blog/start] job 등록 실패:', insertErr?.message)
        throw createError({ statusCode: 500, message: `job 등록 실패: ${insertErr?.message}` })
    }

    // Render ping (슬립 해제용, 응답 타임아웃 2초, 실패 무시)
    const crawlerUrl = process.env.CRAWLER_SERVER_URL
    if (crawlerUrl) {
        try {
            await $fetch(`${crawlerUrl}/ping`, {
                method: 'GET',
                signal: AbortSignal.timeout(2000)
            })
        } catch {
            // 슬립 중이어도 무시 — Render가 일어나면 DB 폴링으로 자동 처리
        }
    }

    return {
        jobId: job.id,
        totalUrls: validUrls.length,
        status: 'pending'
    }
})
