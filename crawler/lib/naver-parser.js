/**
 * Playwright 기반 네이버 블로그 이미지/동영상 URL 추출
 */
const { chromium } = require('playwright')

const MAX_IMAGES_PER_POST = 30
const PAGE_TIMEOUT_MS = 45000

/**
 * 네이버 블로그 URL을 정규화 (PostView 직접 URL로 변환)
 */
function normalizeNaverBlogUrl(url) {
    try {
        const parsed = new URL(url)

        // 이미 PostView 형태면 그대로
        if (parsed.pathname.includes('PostView')) return url

        // blog.naver.com/ID/POST_NO 형태
        const match = parsed.pathname.match(/^\/([^/]+)\/(\d+)$/)
        if (match) {
            const [, blogId, logNo] = match
            return `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true&noTrackingCode=true&directAccess=false`
        }

        return url
    } catch {
        return url
    }
}

/**
 * 이미지 URL 정규화 — 네이버 CDN 썸네일 파라미터 제거해 원본 획득
 */
function normalizeImageUrl(src) {
    if (!src) return null
    try {
        // 네이버 blogfiles / postfiles CDN URL만 처리
        if (!src.includes('blogfiles.pstatic.net') &&
            !src.includes('postfiles.pstatic.net') &&
            !src.includes('mblogthumb-phinf.pstatic.net') &&
            !src.includes('dthumb-phinf.pstatic.net')) {
            return null
        }
        // type= 파라미터 제거해 원본 이미지 URL 획득
        const url = new URL(src)
        url.searchParams.delete('type')
        return url.toString()
    } catch {
        return null
    }
}

/**
 * 동영상 URL 추출 — 네이버 스마트에디터 video 태그 및 스크립트 분석
 */
function extractVideoUrls(page) {
    return page.evaluate(() => {
        const videoUrls = []

        // video 태그의 src 또는 data-src
        document.querySelectorAll('video source, video').forEach(el => {
            const src = el.getAttribute('src') || el.getAttribute('data-src')
            if (src && (src.endsWith('.mp4') || src.includes('video'))) {
                videoUrls.push(src)
            }
        })

        return [...new Set(videoUrls)]
    })
}

/**
 * 단일 블로그 URL에서 미디어 URL 추출
 */
async function extractBlogMedia(rawUrl) {
    const url = normalizeNaverBlogUrl(rawUrl)
    let browser = null

    try {
        browser = await chromium.launch({
            headless: true,
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process',
                '--no-zygote',
            ]
        })

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale: 'ko-KR',
            viewport: { width: 1280, height: 900 }
        })

        const page = await context.newPage()

        // 불필요한 리소스 차단 (속도 향상)
        await page.route('**/*.{woff,woff2,ttf,otf}', route => route.abort())

        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: PAGE_TIMEOUT_MS
        })

        // 이미지가 로드될 때까지 잠시 대기
        await page.waitForTimeout(2000)

        // 이미지 URL 추출
        const rawImageUrls = await page.evaluate(() => {
            const urls = []
            document.querySelectorAll('img').forEach(img => {
                const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src')
                if (src) urls.push(src)
            })
            return urls
        })

        // 동영상 URL 추출
        const videoUrls = await extractVideoUrls(page)

        await browser.close()
        browser = null

        // 이미지 URL 정규화 및 필터링
        const imageUrls = rawImageUrls
            .map(normalizeImageUrl)
            .filter(Boolean)

        const allUrls = [
            ...new Set([...imageUrls.slice(0, MAX_IMAGES_PER_POST), ...videoUrls])
        ]

        console.log(`[parser] ${rawUrl} → 이미지 ${imageUrls.length}개, 동영상 ${videoUrls.length}개`)
        return allUrls

    } catch (err) {
        console.error(`[parser] 오류 url=${rawUrl}:`, err.message)
        throw err
    } finally {
        if (browser) await browser.close().catch(() => { })
    }
}

module.exports = { extractBlogMedia }
