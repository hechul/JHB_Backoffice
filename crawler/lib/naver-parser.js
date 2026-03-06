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

// 외부에서 네트워크 응답(response) 이벤트를 통해 MP4 URL을 수집하도록 대체됨
// 기존 HTML/스크립트 기반 동영상 추출 로직은 유지하되 보조 수단으로 사용
function extractVideoUrls(page) {
    return page.evaluate(() => {
        const urls = new Set()
        const push = (value) => {
            if (!value) return
            const v = String(value).trim()
            if (!v) return
            if (v.startsWith('//')) { urls.add(`https:${v}`); return }
            if (v.startsWith('http://') || v.startsWith('https://')) urls.add(v)
        }

        const isLikelyVideo = (v) => {
            v = String(v || '').toLowerCase()
            return v.includes('mblogvideo-phinf') || v.includes('/video/') ||
                v.endsWith('.mp4') || v.includes('.mp4?') ||
                v.endsWith('.mov') || v.includes('.mov?')
        }

        document.querySelectorAll('video source, video, iframe').forEach((el) => {
            ['src', 'data-src', 'data-video-src'].forEach(attr => {
                const val = el.getAttribute(attr); if (isLikelyVideo(val)) push(val)
            })
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

        // 동영상 추출용 네트워크 응답 수집기 및 메타데이터(vid/inkey) 기반 보조 추출
        const interceptedVideos = new Set()

        // 1. 네트워크 인터셉터 (iframe 등에서 재생 시 발생하는 요청 캡처)
        page.on('response', async (response) => {
            try {
                const reqUrl = response.url()
                // 네이버 동영상 플레이어 메타데이터 API
                if (reqUrl.includes('rmcnmv.naver.com/vod/play/')) {
                    const json = await response.json()
                    const list = json?.videos?.list || []
                    list.forEach(v => {
                        // 가장 고화질 순으로 혹은 단순히 모두 수집
                        if (v.source && v.source.includes('mp4')) {
                            interceptedVideos.add(v.source)
                        }
                    })
                }
            } catch (e) { }
        })

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

        // 추가 렌더링 여유 대기 (동영상 모듈 초기화 대기 포함)
        await page.waitForTimeout(2000)
        await autoScroll(page)
        await page.waitForTimeout(1200)

        // 2. DOM에서 직접 vid, inkey 추출 (가장 확실한 방법)
        const videoKeys = await page.evaluate(() => {
            const keys = new Set();
            document.querySelectorAll('[data-module]').forEach(el => {
                const data = el.getAttribute('data-module');
                if (data && data.includes('vid') && data.includes('inkey')) {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.data && parsed.data.vid && parsed.data.inkey) {
                            keys.add(JSON.stringify({ vid: parsed.data.vid, inKey: parsed.data.inkey }));
                        }
                    } catch (e) { }
                }
            });
            return Array.from(keys).map(k => JSON.parse(k));
        });

        // 추출된 키로 동영상 API 서버 직접 찌르기
        for (const keyObj of videoKeys) {
            try {
                const apiRes = await page.request.get(`https://apis.naver.com/rmcnmv/rmcnmv/vod/play/v2.0/${keyObj.vid}?key=${keyObj.inKey}`);
                const json = await apiRes.json();
                const list = json?.videos?.list || [];

                // 최고 화질 1개만 추출 (ZIP 파일 용량 최적화)
                let bestVideo = null;
                for (const v of list) {
                    if (v.source && v.source.includes('mp4')) {
                        if (!bestVideo || (v.size && v.size > bestVideo.size)) {
                            bestVideo = v;
                        }
                    }
                }

                if (bestVideo && bestVideo.source) {
                    interceptedVideos.add(bestVideo.source);
                }
            } catch (e) { }
        }

        // 이미지 URL 추출 함수 — 메인 frame과 중첩 frame 모두 탐색
        async function extractImagesFromFrame(frame) {
            try {
                return await frame.evaluate(() => {
                    const urls = []
                    const basePaths = new Set()

                    const getBasePath = (u) => {
                        try {
                            const p = new URL(u)
                            const parts = p.pathname.split('/')
                            parts.pop()
                            return parts.join('/')
                        } catch (e) { return u }
                    }

                    // 1. 블로거가 업로드한 진짜 원본 해상도(고화질) 이미지는 a 태그나 기타 컨테이너의 data-linkdata 에 JSON으로 들어있음
                    document.querySelectorAll('[data-linkdata]').forEach(el => {
                        try {
                            const parsed = JSON.parse(el.getAttribute('data-linkdata'));
                            if (parsed.src && typeof parsed.src === 'string') {
                                // 외부 사이트 아이콘이나 스티커 등 불필요한 이미지 필터링
                                if (parsed.src.includes('pstatic.net') && !parsed.src.includes('storep-phinf.pstatic.net')) {
                                    urls.push(parsed.src);
                                    basePaths.add(getBasePath(parsed.src));
                                }
                            }
                        } catch (e) { }
                    });

                    // 2. data-linkdata가 없는 일반 img 태그들 (fallback)
                    document.querySelectorAll('img').forEach(img => {
                        // data-lazy-src, data-src 우선 (SE3 lazy-load 원본 URL)
                        const src = img.getAttribute('data-lazy-src') ||
                            img.getAttribute('data-src') ||
                            img.getAttribute('data-original') ||
                            img.getAttribute('src')

                        if (src) {
                            const bp = getBasePath(src);
                            if (!basePaths.has(bp)) {
                                urls.push(src);
                                basePaths.add(bp);
                            }
                        }
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
            if (frameUrl && (frameUrl.includes('blog.naver.com') || frameUrl.includes('PostView'))) {
                const frameImages = await extractImagesFromFrame(frame)
                rawImageUrls = rawImageUrls.concat(frameImages)
            }
        }

        // 동영상 URL 추출 (메인 frame + 자식 frame + 네트워크 인터셉터 결과 합병)
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

        // 인터셉트된 MP4 강제 추가
        videoUrls.push(...Array.from(interceptedVideos))

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
