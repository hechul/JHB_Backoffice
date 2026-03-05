/**
 * 수집된 미디어 파일들을 ZIP으로 생성
 */
const archiver = require('archiver')
const https = require('https')
const http = require('http')
const { Readable } = require('stream')

const MAX_IMAGES_PER_POST = 30
const DOWNLOAD_TIMEOUT_MS = 30000

/**
 * URL에서 파일 다운로드 → Buffer 반환
 */
function downloadFile(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http
        const timer = setTimeout(() => reject(new Error('download timeout')), DOWNLOAD_TIMEOUT_MS)

        const req = client.get(url, {
            headers: {
                'Referer': 'https://blog.naver.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                clearTimeout(timer)
                return reject(new Error(`HTTP ${res.statusCode}`))
            }
            const chunks = []
            res.on('data', chunk => chunks.push(chunk))
            res.on('end', () => {
                clearTimeout(timer)
                resolve(Buffer.concat(chunks))
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

/**
 * URL에서 확장자 추출 (기본값 jpg)
 */
function getExt(url) {
    try {
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

                for (const mediaUrl of mediaUrls.slice(0, MAX_IMAGES_PER_POST)) {
                    try {
                        const buffer = await downloadFile(mediaUrl)
                        const ext = getExt(mediaUrl)
                        const filename = `${blogId}_${logNo}_${String(fileIndex).padStart(3, '0')}.${ext}`
                        archive.append(buffer, { name: filename })
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
