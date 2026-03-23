import { createClient } from '@supabase/supabase-js'

const BLOG_MEDIA_BUCKET = 'blog-media-zips'

export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, 'jobId')
  if (!jobId) {
    throw createError({ statusCode: 400, message: 'jobId가 필요합니다.' })
  }

  const body = (await readBody(event).catch(() => ({}))) || {}
  const partId = String(body.partId || '').trim()

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
    .select('id, storage_path, summary_json')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    throw createError({ statusCode: 404, message: 'job을 찾을 수 없습니다.' })
  }

  const summary = ((job as any).summary_json && typeof (job as any).summary_json === 'object')
    ? { ...((job as any).summary_json as Record<string, any>) }
    : {}

  const zipParts = Array.isArray(summary.zip_parts)
    ? (summary.zip_parts as any[]).map((part) => ({
      id: String(part?.id || ''),
      path: String(part?.path || '').trim(),
      sourceUrl: String(part?.sourceUrl || ''),
      fileCount: Number(part?.fileCount || 0),
      sizeBytes: Number(part?.sizeBytes || 0),
    })).filter((part) => part.path)
    : []

  let removedPath = ''
  let updatePayload: Record<string, any> = {}

  if (zipParts.length > 0) {
    const selected = partId
      ? zipParts.find((part) => part.id === partId)
      : zipParts[0]

    if (!selected) {
      return { ok: true, removed: null, remaining: zipParts.length }
    }

    removedPath = selected.path
    const remainingParts = zipParts.filter((part) => part.id !== selected.id)
    summary.zip_parts = remainingParts

    if (remainingParts.length > 0) {
      updatePayload = {
        storage_path: remainingParts[0]?.path || null,
        summary_json: summary,
      }
    } else {
      updatePayload = {
        storage_path: null,
        download_url: null,
        expires_at: new Date().toISOString(),
        summary_json: summary,
      }
    }
  } else {
    const storagePath = String((job as any).storage_path || '').trim()
    if (!storagePath) {
      return { ok: true, removed: null, remaining: 0 }
    }
    removedPath = storagePath
    updatePayload = {
      storage_path: null,
      download_url: null,
      expires_at: new Date().toISOString(),
    }
  }

  const { error: removeError } = await adminClient
    .storage
    .from(BLOG_MEDIA_BUCKET)
    .remove([removedPath])
  if (removeError) {
    // 이미 삭제된 경우도 허용 (idempotent)
    console.warn('[blog/cleanup] storage remove warning:', removeError.message)
  }

  const { error: updateError } = await adminClient
    .from('automation_jobs')
    .update(updatePayload)
    .eq('id', job.id)
  if (updateError) {
    console.error('[blog/cleanup] job update failed:', updateError.message)
  }

  const nextParts = Array.isArray(summary.zip_parts) ? summary.zip_parts.length : 0
  return { ok: true, removed: removedPath, remaining: nextParts }
})

