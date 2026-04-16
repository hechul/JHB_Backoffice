import { createClient } from '@supabase/supabase-js'

const BLOG_MEDIA_BUCKET = 'blog-media-zips'

function getFileNameFromPath(path: string): string {
  const raw = String(path || '').trim()
  if (!raw) return 'blog_media.zip'
  const pieces = raw.split('/').filter(Boolean)
  return pieces[pieces.length - 1] || 'blog_media.zip'
}

export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, 'jobId')
  if (!jobId) {
    throw createError({ statusCode: 400, message: 'jobId가 필요합니다.' })
  }
  const query = getQuery(event)
  const requestedPartId = String(query.part || '').trim()

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
    .select('id, status, storage_path, expires_at, summary_json')
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
      label: String(part?.label || ''),
      path: String(part?.path || '').trim(),
      sourceUrl: String(part?.sourceUrl || ''),
      fileCount: Number(part?.fileCount || 0),
      sizeBytes: Number(part?.sizeBytes || 0),
      sourceChunkIndex: Number(part?.sourceChunkIndex || 0),
      sourceChunkTotal: Number(part?.sourceChunkTotal || 0),
    })).filter((part) => part.path)
    : []

  let selectedPartId = ''
  let storagePath = ''
  if (zipParts.length > 0) {
    const selected = requestedPartId
      ? zipParts.find((part) => part.id === requestedPartId)
      : zipParts[0]
    if (!selected) {
      throw createError({ statusCode: 404, message: '요청한 다운로드 파트를 찾을 수 없습니다.' })
    }
    selectedPartId = selected.id
    storagePath = selected.path
  } else {
    storagePath = String((job as any).storage_path || '').trim()
  }

  if (!storagePath) {
    throw createError({ statusCode: 404, message: '다운로드 가능한 파일이 없습니다. 이미 다운로드되어 정리되었을 수 있습니다.' })
  }

  const isExpired = job.expires_at ? new Date(String(job.expires_at)) < new Date() : false
  if (isExpired) {
    throw createError({ statusCode: 410, message: '다운로드 링크가 만료되었습니다.' })
  }

  const { data: blobData, error: downloadError } = await adminClient
    .storage
    .from(BLOG_MEDIA_BUCKET)
    .download(storagePath)

  if (downloadError || !blobData) {
    throw createError({
      statusCode: 404,
      message: `스토리지 파일 다운로드 실패: ${downloadError?.message || '파일 없음'}`,
    })
  }

  const arrayBuffer = await blobData.arrayBuffer()
  const zipBuffer = Buffer.from(arrayBuffer)
  const filename = getFileNameFromPath(storagePath)

  // 다운로드 1회 처리: 반환할 바이너리를 메모리에 확보한 뒤 스토리지에서 즉시 제거
  const { error: removeError } = await adminClient
    .storage
    .from(BLOG_MEDIA_BUCKET)
    .remove([storagePath])
  if (removeError) {
    console.error('[blog/download] storage remove failed:', removeError.message)
  }

  let updatePayload: Record<string, any> = {}
  if (zipParts.length > 0 && selectedPartId) {
    const remainingParts = zipParts.filter((part) => part.id !== selectedPartId)
    summary.zip_parts = remainingParts
    if (remainingParts.length > 0) {
      updatePayload = {
        storage_path: remainingParts[0]?.path || null,
        download_url: null,
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
    updatePayload = {
      storage_path: null,
      download_url: null,
      expires_at: new Date().toISOString(),
    }
  }

  const { error: updateError } = await adminClient
    .from('automation_jobs')
    .update(updatePayload)
    .eq('id', job.id)
  if (updateError) {
    console.error('[blog/download] job cleanup update failed:', updateError.message)
  }

  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  setHeader(event, 'Cache-Control', 'no-store')
  return zipBuffer
})
