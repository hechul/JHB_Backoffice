/**
 * Supabase Storage에 ZIP 파일 업로드
 * 버킷 'blog-media-zips'는 Supabase 대시보드에서 미리 생성되어 있어야 함
 */

const BUCKET_NAME = 'blog-media-zips'

/**
 * ZIP Buffer를 Supabase Storage에 업로드하고 서명된 다운로드 URL 반환
 */
async function uploadZipToStorage(supabase, jobId, zipBuffer) {
    const filename = `${jobId}/blog_media_${jobId.slice(0, 8)}.zip`

    console.log(`[uploader] 업로드 시작: ${filename} (${(zipBuffer.length / 1024 / 1024).toFixed(2)}MB)`)

    // ZIP Buffer를 Uint8Array로 변환 (Supabase SDK 호환)
    const uint8 = new Uint8Array(zipBuffer)

    const { error: uploadErr } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filename, uint8, {
            contentType: 'application/zip',
            upsert: true
        })

    if (uploadErr) {
        console.error(`[uploader] 업로드 실패:`, uploadErr.message)
        throw new Error(`Storage 업로드 실패: ${uploadErr.message}`)
    }

    // 서명된 URL 생성 (24시간 유효)
    const { data: signedData, error: signErr } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(filename, 24 * 60 * 60)

    if (signErr) throw new Error(`서명 URL 생성 실패: ${signErr.message}`)

    console.log(`[uploader] 업로드 완료: ${filename}`)
    return {
        path: filename,
        signedUrl: signedData.signedUrl
    }
}

module.exports = { uploadZipToStorage }
