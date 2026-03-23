/**
 * 수집된 미디어 파일들을 ZIP으로 생성
 */
const archiver = require('archiver')
const https = require('https')
const http = require('http')

// 0이면 제한 없이 전체 저장
const MAX_MEDIA_PER_POST = Number.parseInt(process.env.MAX_MEDIA_PER_POST || '0', 10) || 0
const DOWNLOAD_TIMEOUT_MS = 30000
const DOWNLOAD_RETRY_COUNT = Math.max(1, Math.min(Number.parseInt(process.env.BLOG_DOWNLOAD_RETRY_COUNT || '3', 10) || 3, 5))
const DOWNLOAD_RETRY_BACKOFF_MS = 700

function isLikelyTextContent(contentType = '') {
    const t = String(contentType).toLowerCase()
    return t.includes('text/') || t.includes('application/json') || t.includes('application/xml') || t.includes('application/xhtml+xml') || t.includes('application/javascript')
}

function detectExtFromContentType(contentType = '') {
    const t = String(contentType).toLowerCase()
    if (t.includes('video/mp4')) return 'mp4'
    if (t.includes('video/quicktime')) return 'mov'
    if (t.includes('application/vnd.apple.mpegurl') || t.includes('application/x-mpegurl')) return 'm3u8'
    if (t.includes('image/jpeg')) return 'jpg'
    if (t.includes('image/png')) return 'png'
    if (t.includes('image/gif')) return 'gif'
    if (t.includes('image/webp')) return 'webp'
    return ''
}

function detectExtFromMagic(buffer) {
    if (!buffer || buffer.length < 12) return ''

    // jpeg
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg'
    // png
    if (
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
        buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A
    ) return 'png'
    // gif
    if (
        buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 &&
        buffer[3] === 0x38 && (buffer[4] === 0x39 || buffer[4] === 0x37) && buffer[5] === 0x61
    ) return 'gif'
    // webp: RIFF....WEBP
    if (
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) return 'webp'
    // mp4/mov: ....ftyp
    if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
        return 'mp4'
    }
    // m3u8 text
    const head = buffer.slice(0, 32).toString('utf8').toUpperCase()
    if (head.includes('#EXTM3U')) return 'm3u8'

    return ''
}

function looksLikeHtml(buffer) {
    if (!buffer || buffer.length === 0) return false
    const head = buffer.slice(0, 512).toString('utf8').toLowerCase()
    return head.includes('<!doctype html') || head.includes('<html') || head.includes('<head') || head.includes('<body')
}

const DEFAULT_HEADERS = {
    'Referer': 'https://blog.naver.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9',
}

/**
 * URL에서 파일 다운로드 → Buffer + contentType 반환
 * 리다이렉트(301/302/307/308)를 최대 MAX_REDIRECTS회 Referer 유지하며 follow
 */
const MAX_REDIRECTS = 5
function downloadFileOnce(url, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http
        const timer = setTimeout(() => reject(new Error('download timeout')), DOWNLOAD_TIMEOUT_MS)

        const req = client.get(url, { headers: DEFAULT_HEADERS }, (res) => {
            // 리다이렉트 처리
            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                const location = res.headers['location']
                clearTimeout(timer)
                res.resume() // 응답 body 버림
                if (!location) return reject(new Error('redirect without location'))
                if (redirectCount >= MAX_REDIRECTS) return reject(new Error('too many redirects'))
                const nextUrl = location.startsWith('http') ? location : new URL(location, url).toString()
                return resolve(downloadFileOnce(nextUrl, redirectCount + 1))
            }

            if (res.statusCode !== 200) {
                clearTimeout(timer)
                res.resume()
                return reject(new Error(`HTTP ${res.statusCode}`))
            }
            const chunks = []
            res.on('data', chunk => chunks.push(chunk))
            res.on('end', () => {
                clearTimeout(timer)
                resolve({
                    buffer: Buffer.concat(chunks),
                    contentType: String(res.headers['content-type'] || '')
                })
            })
            res.on('error', err => {
                clearTimeout(timer)
                reject(err)
            })
        })

        req.on('error', err => {
            clearTimeout(timer)
            reject(err)
        })
    })
}

async function downloadFile(url) {
    let currentUrl = url
    let lastError = null

    // Fallback 로직을 허용하기 위해 +2회 추가 기회 부여
    const maxAttempts = DOWNLOAD_RETRY_COUNT + 2
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await downloadFileOnce(currentUrl)
        } catch (err) {
            lastError = err

            // 네이버 블로그 이미지 404 Fallback 처리
            // 저화질(no-type) 강등은 금지. 고화질 대역 내에서만 강등
            // w2000 -> w1600 -> w1080 -> w800
            if (err.message === 'HTTP 404') {
                if (currentUrl.includes('type=w2000')) {
                    console.log(`[zipper] 404 for w2000, fallback to w1600: ${currentUrl}`)
                    currentUrl = currentUrl.replace('type=w2000', 'type=w1600')
                    continue
                }
                if (currentUrl.includes('type=w1600')) {
                    console.log(`[zipper] 404 for w1600, fallback to w1080: ${currentUrl}`)
                    currentUrl = currentUrl.replace('type=w1600', 'type=w1080')
                    continue
                }
                if (currentUrl.includes('type=w1080')) {
                    console.log(`[zipper] 404 for w1080, fallback to w800: ${currentUrl}`)
                    currentUrl = currentUrl.replace('type=w1080', 'type=w800')
                    continue
                }
            }

            if (attempt >= maxAttempts) break
            const waitMs = DOWNLOAD_RETRY_BACKOFF_MS * attempt
            await new Promise((resolve) => setTimeout(resolve, waitMs))
        }
    }
    throw lastError || new Error('download failed')
}

/**
 * URL에서 확장자 추출 (기본값 jpg)
 */
function getExt(url) {
    try {
        if (String(url || '').includes('type=mp4')) return 'mp4'
        const pathname = new URL(url).pathname
        const match = pathname.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov|avi)$/i)
        return match ? match[1].toLowerCase() : 'jpg'
    } catch {
        return 'jpg'
    }
}

/**
 * 블로그ID와 포스트번호를 URL에서 추출
 */
function extractBlogInfo(url) {
    try {
        const parsed = new URL(url)
        // PostView.naver?blogId=XXX&logNo=YYY
        const blogId = parsed.searchParams.get('blogId')
        const logNo = parsed.searchParams.get('logNo')
        if (blogId && logNo) return { blogId, logNo }

        // /blogId/postNo 경로 형태
        const match = parsed.pathname.match(/^\/([^/]+)\/(\d+)$/)
        if (match) return { blogId: match[1], logNo: match[2] }

        return { blogId: 'unknown', logNo: Date.now().toString() }
    } catch {
        return { blogId: 'unknown', logNo: Date.now().toString() }
    }
}

/**
 * results 배열 → ZIP Buffer 생성
 * results: [{ url, mediaUrls: string[] }]
 */
async function createZip(results) {
    return new Promise((resolve, reject) => {
        const chunks = []
        const archive = archiver('zip', { zlib: { level: 6 } })

        archive.on('data', chunk => chunks.push(chunk))
        archive.on('end', () => resolve(Buffer.concat(chunks)))
        archive.on('error', reject)

        const processAll = async () => {
            for (const { url, mediaUrls } of results) {
                const { blogId, logNo } = extractBlogInfo(url)
                let fileIndex = 1

                const targets = MAX_MEDIA_PER_POST > 0
                    ? mediaUrls.slice(0, MAX_MEDIA_PER_POST)
                    : mediaUrls

                for (const mediaUrl of targets) {
                    try {
                        const downloaded = await downloadFile(mediaUrl)

                        if (!downloaded.buffer || downloaded.buffer.length < 64) {
                            console.warn(`[zipper] 너무 작은 응답으로 제외: ${mediaUrl} (${downloaded.buffer?.length || 0} bytes)`)
                            continue
                        }

                        if (looksLikeHtml(downloaded.buffer) || isLikelyTextContent(downloaded.contentType)) {
                            const magic = detectExtFromMagic(downloaded.buffer)
                            const isM3u8 = magic === 'm3u8'
                            if (!isM3u8) {
                                console.warn(`[zipper] HTML/텍스트 응답 제외: ${mediaUrl} (${downloaded.contentType || '-'})`)
                                continue
                            }
                        }

                        const extByMagic = detectExtFromMagic(downloaded.buffer)
                        const extByHeader = detectExtFromContentType(downloaded.contentType)
                        const ext = extByMagic || extByHeader || getExt(mediaUrl)
                        const filename = `${blogId}_${logNo}_${String(fileIndex).padStart(3, '0')}.${ext}`
                        archive.append(downloaded.buffer, { name: filename })
                        fileIndex++
                    } catch (err) {
                        console.warn(`[zipper] 다운로드 실패: ${mediaUrl} — ${err.message}`)
                    }
                }
            }
            archive.finalize()
        }

        processAll().catch(reject)
    })
}

module.exports = { createZip }
