/**
 * Playwright 기반 네이버 블로그 이미지/동영상 URL 추출
 */
const { chromium } = require('playwright')

const PAGE_TIMEOUT_MS = 90000  // Render 무료 플랜 느린 환경 대응 (90초)
const DEFAULT_IMAGE_TYPE = String(process.env.BLOG_IMAGE_TYPE || 'w800')

function toAbsoluteUrl(src) {
    if (!src) return null
    const value = String(src).trim()
    if (!value) return null
    if (value.startsWith('//')) return `https:${value}`
    if (value.startsWith('http://') || value.startsWith('https://')) return value
    return null
}

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

function normalizeImageUrl(src) {
    const absolute = toAbsoluteUrl(src)
    if (!absolute) return null
    try {
        // 원본 이미지 CDN만 수집
        if (!absolute.includes('blogfiles.pstatic.net') &&
            !absolute.includes('postfiles.pstatic.net')) {
            return null
        }

        // type= 파라미터를 강제로 수정하면 404가 나는 경우가 많으므로 (서명/토큰 만료 등)
        // 원본 URL을 최대한 유지한다.
        const urlObj = new URL(absolute)

        // 불필요한 추적 파라미터 등은 제거
        return urlObj.toString()
    } catch {
        return null
    }
}

function normalizeVideoUrl(src) {
    const absolute = toAbsoluteUrl(src)
    if (!absolute) return null
    const lower = absolute.toLowerCase()
    const isLikelyVideo =
        lower.includes('mblogvideo-phinf.pstatic.net') ||
        lower.includes('/video/') ||
        lower.includes('/movie/') ||
        lower.includes('/vod/') ||
        lower.endsWith('.mp4') ||
        lower.includes('.mp4?') ||
        lower.endsWith('.mov') ||
        lower.includes('.mov?') ||
        lower.endsWith('.m3u8') ||
        lower.includes('.m3u8?')
    if (!isLikelyVideo) return null
    return absolute
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let loops = 0
            const maxLoops = 30
            const timer = setInterval(() => {
                loops += 1
                window.scrollBy(0, Math.max(window.innerHeight * 0.9, 480))
                const bottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 8
                if (bottom || loops >= maxLoops) {
                    clearInterval(timer)
                    window.scrollTo(0, 0)
                    setTimeout(resolve, 120)
                }
            }, 120)
        })
    })
}

/**
 * 동영상 URL 추출 — 네이버 스마트에디터 video 태그 및 스크립트 분석
 */
function extractVideoUrls(page) {
    return page.evaluate(() => {
        const urls = new Set()

        const push = (value) => {
            if (!value) return
            const v = String(value).trim()
            if (!v) return
            if (v.startsWith('//')) {
                urls.add(`https:${v}`)
                return
            }
            if (v.startsWith('http://') || v.startsWith('https://')) {
                urls.add(v)
            }
        }

        const isLikelyVideo = (value) => {
            const v = String(value || '').toLowerCase()
            return (
                v.includes('mblogvideo-phinf.pstatic.net') ||
                v.includes('/video/') ||
                v.includes('/movie/') ||
                v.includes('/vod/') ||
                v.endsWith('.mp4') || v.includes('.mp4?') ||
                v.endsWith('.mov') || v.includes('.mov?') ||
                v.endsWith('.m3u8') || v.includes('.m3u8?')
            )
        }

        // 1) video/source 직접 src
        document.querySelectorAll('video source, video').forEach((el) => {
            const attrs = ['src', 'data-src', 'data-lazy-src', 'data-video-src']
            attrs.forEach((attr) => {
                const value = el.getAttribute(attr)
                if (value && isLikelyVideo(value)) push(value)
            })
        })

        // 2) iframe embed src
        document.querySelectorAll('iframe').forEach((el) => {
            const src = el.getAttribute('src')
            if (src && isLikelyVideo(src)) push(src)
        })

        // 3) data-* 속성 전수 조사
        document.querySelectorAll('[data-src], [data-video-src], [data-lazy-src], [data-play-url], [data-url]').forEach((el) => {
            const attrs = ['data-src', 'data-video-src', 'data-lazy-src', 'data-play-url', 'data-url']
            attrs.forEach((attr) => {
                const value = el.getAttribute(attr)
                if (value && isLikelyVideo(value)) push(value)
            })
        })

        // 4) 스크립트 텍스트 내 직접 URL 추출
        const scriptRegex = /(https?:\/\/[^\s"'\\]+(?:mblogvideo-phinf\.pstatic\.net[^\s"'\\]*|[^\s"'\\]*\.(?:mp4|mov|m3u8)(?:\?[^\s"'\\]*)?))/ig
        document.querySelectorAll('script').forEach((el) => {
            const text = el.textContent || ''
            let m
            while ((m = scriptRegex.exec(text)) !== null) {
                if (m[1]) push(m[1])
            }
        })

        return Array.from(urls)
    })
}

/**
 * 단일 블로그 URL에서 미디어 URL 추출
 */
async function extractBlogMedia(rawUrl, options = {}) {
    const imageType = String(options.imageType || DEFAULT_IMAGE_TYPE || '').trim()
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
            waitUntil: 'networkidle',
            timeout: PAGE_TIMEOUT_MS
        })

        // SE3 에디터 이미지 렌더링 대기 (넓은 선택자로 — lazy-load 포함)
        await page.waitForSelector('img', { timeout: 8000 }).catch(() => { })

        // 추가 렌더링 여유 대기
        await page.waitForTimeout(2000)
        await autoScroll(page)
        await page.waitForTimeout(1200)

        // 이미지 URL 추출 함수 — 메인 frame과 중첩 frame 모두 탐색
        async function extractImagesFromFrame(frame) {
            try {
                return await frame.evaluate(() => {
                    const urls = []
                    document.querySelectorAll('img').forEach(img => {
                        // data-lazy-src, data-src 우선 (SE3 lazy-load 원본 URL)
                        const src = img.getAttribute('data-lazy-src') ||
                            img.getAttribute('data-src') ||
                            img.getAttribute('data-original') ||
                            img.getAttribute('src')
                        if (src) urls.push(src)
                    })
                    return urls
                })
            } catch {
                return []
            }
        }

        // 메인 frame 이미지 수집
        let rawImageUrls = await extractImagesFromFrame(page.mainFrame())

        // 중첩 frame(blog.naver.com 래퍼 구조) 이미지 수집
        for (const frame of page.frames()) {
            if (frame === page.mainFrame()) continue
            const frameUrl = frame.url()
            // PostView / 블로그 콘텐츠 frame만 처리
            if (frameUrl && (frameUrl.includes('blog.naver.com') || frameUrl.includes('PostView'))) {
                const frameImages = await extractImagesFromFrame(frame)
                rawImageUrls = rawImageUrls.concat(frameImages)
            }
        }

        // 동영상 URL 추출 (메인 frame + 자식 frame)
        const videoUrls = await extractVideoUrls(page)
        for (const frame of page.frames()) {
            if (frame === page.mainFrame()) continue
            const frameUrl = frame.url()
            if (frameUrl && (frameUrl.includes('blog.naver.com') || frameUrl.includes('PostView'))) {
                try {
                    const frameVideoUrls = await extractVideoUrls(frame)
                    videoUrls.push(...frameVideoUrls)
                } catch { }
            }
        }

        await browser.close()
        browser = null

        // 이미지 URL 정규화 및 필터링
        const imageUrls = Array.from(new Set(rawImageUrls))
            .map((src) => normalizeImageUrl(src))
            .filter(Boolean)

        const allUrls = Array.from(new Set([
            ...imageUrls,
            ...videoUrls.map(normalizeVideoUrl).filter(Boolean),
        ]))

        console.log(`[parser] ${rawUrl} → 이미지 ${imageUrls.length}개, 동영상 ${videoUrls.length}개, imageType=${imageType || '-'}`)
        return allUrls

    } catch (err) {
        console.error(`[parser] 오류 url=${rawUrl}:`, err.message)
        throw err
    } finally {
        if (browser) await browser.close().catch(() => { })
    }
}

module.exports = { extractBlogMedia }
