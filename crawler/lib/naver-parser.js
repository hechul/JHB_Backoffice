/**
 * Playwright 기반 네이버 블로그 이미지/동영상 URL 추출
 */
const { chromium } = require('playwright')

const MAX_IMAGES_PER_POST = 30
const PAGE_TIMEOUT_MS = 90000  // Render 무료 플랜 느린 환경 대응 (90초)

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
 * 이미지 URL 정규화 — type=w2000으로 교체해 최대 화질 획득
 * (네이버 CDN: type 없음 → 5KB 최소, type=w2000 → 71KB 최대)
 */
function normalizeImageUrl(src) {
    if (!src) return null
    try {
        // 원본 이미지 CDN만 수집
        if (!src.includes('blogfiles.pstatic.net') &&
            !src.includes('postfiles.pstatic.net')) {
            return null
        }
        // type=w2000으로 교체 (최대 화질)
        const url = new URL(src)
        url.searchParams.set('type', 'w2000')
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

        // video 태그의 src 또는 data-src (mblogvideo CDN 포함)
        document.querySelectorAll('video source, video').forEach(el => {
            const src = el.getAttribute('src') || el.getAttribute('data-src')
            if (src && (
                src.includes('mblogvideo-phinf.pstatic.net') ||
                src.endsWith('.mp4') ||
                src.includes('/video/')
            )) {
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

        // 광고·추적·폰트 등 불필요한 리소스 차단 (속도 대폭 향상)
        await page.route('**', (route) => {
            const u = route.request().url()
            if (u.includes('adservice') || u.includes('googlesyndication') ||
                u.includes('doubleclick') || u.includes('ad.naver') ||
                u.includes('analytics') || u.includes('beacon') ||
                u.includes('.woff') || u.includes('.ttf') || u.includes('.otf')) {
                return route.abort()
            }
            return route.continue()
        })

        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: PAGE_TIMEOUT_MS
        })

        // postfiles 이미지가 DOM에 나타날 때까지 최대 15초 대기 (SE3 렌더링 대기)
        await page.waitForSelector(
            'img[src*="postfiles.pstatic.net"], img[src*="blogfiles.pstatic.net"]',
            { timeout: 15000 }
        ).catch(() => { /* 이미지 없는 포스트 허용 */ })

        // 추가 렌더링 여유 대기
        await page.waitForTimeout(1500)

        // 이미지 URL 추출 — data-src, data-lazy-src 우선 (lazy-load 원본), src는 fallback
        const rawImageUrls = await page.evaluate(() => {
            const urls = []
            document.querySelectorAll('img').forEach(img => {
                // data-src, data-lazy-src에 원본 URL이 있는 경우가 많음
                const src = img.getAttribute('data-lazy-src') ||
                    img.getAttribute('data-src') ||
                    img.getAttribute('src')
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
