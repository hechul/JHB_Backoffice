import { createClient } from '@supabase/supabase-js'

const BLOG_MEDIA_BUCKET = 'blog-media-zips'

export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, 'jobId')
  if (!jobId) {
    throw createError({ statusCode: 400, message: 'jobId가 필요합니다.' })
  }

  const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw createError({ statusCode: 500, message: '서버 환경변수(SUPABASE) 설정이 필요합니다.' })
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const { data: job, error: jobError } = await adminClient
    .from('automation_jobs')
    .select('id, status, storage_path, summary_json')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    throw createError({ statusCode: 404, message: 'job을 찾을 수 없습니다.' })
  }

  const summary = ((job as any).summary_json && typeof (job as any).summary_json === 'object')
    ? { ...((job as any).summary_json as Record<string, any>) }
    : {}

  const zipParts = Array.isArray(summary.zip_parts)
    ? (summary.zip_parts as any[])
      .map((part) => String(part?.path || '').trim())
      .filter(Boolean)
    : []

  const legacyPath = String((job as any).storage_path || '').trim()
  const removeTargets = Array.from(new Set([
    ...zipParts,
    ...(legacyPath ? [legacyPath] : []),
  ]))

  if (removeTargets.length > 0) {
    const { error: removeError } = await adminClient
      .storage
      .from(BLOG_MEDIA_BUCKET)
      .remove(removeTargets)
    if (removeError) {
      console.warn('[blog/cancel] storage remove warning:', removeError.message)
    }
  }

  const nextSummary = {
    ...summary,
    zip_parts: [],
    canceled_at: new Date().toISOString(),
  }

  const { error: updateError } = await adminClient
    .from('automation_jobs')
    .update({
      status: 'canceled',
      storage_path: null,
      download_url: null,
      expires_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      summary_json: nextSummary,
    })
    .eq('id', job.id)

  if (updateError) {
    console.error('[blog/cancel] job update failed:', updateError.message)
    throw createError({ statusCode: 500, message: '작업 중단 처리에 실패했습니다.' })
  }

  return {
    ok: true,
    jobId: job.id,
    status: 'canceled',
  }
})
