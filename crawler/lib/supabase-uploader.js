/**
 * Supabase Storage에 ZIP 파일 업로드
 */

const BUCKET_NAME = 'blog-media-zips'

/**
 * ZIP Buffer를 Supabase Storage에 업로드하고 서명된 다운로드 URL 반환
 */
async function uploadZipToStorage(supabase, jobId, zipBuffer) {
    const filename = `${jobId}/blog_media_${jobId.slice(0, 8)}.zip`

    // 버킷 존재 확인 (없으면 생성)
    const { data: buckets } = await supabase.storage.listBuckets()
    const bucketExists = buckets?.some(b => b.name === BUCKET_NAME)
    if (!bucketExists) {
        const { error: createErr } = await supabase.storage.createBucket(BUCKET_NAME, {
            public: false,
            fileSizeLimit: 524288000 // 500MB
        })
        if (createErr) throw new Error(`버킷 생성 실패: ${createErr.message}`)
        console.log(`[uploader] 버킷 생성: ${BUCKET_NAME}`)
    }

    // 업로드
    const { error: uploadErr } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filename, zipBuffer, {
            contentType: 'application/zip',
            upsert: true
        })

    if (uploadErr) throw new Error(`Storage 업로드 실패: ${uploadErr.message}`)

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
