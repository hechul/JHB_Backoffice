const { chromium } = require('playwright');
const https = require('https');

async function checkUrl(url, label) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      console.log(`[${label}] Status: ${res.statusCode}, Content-Length: ${res.headers['content-length']}`);
      resolve(res.statusCode);
    }).on('error', (e) => {
      resolve(0);
    });
  });
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://blog.naver.com/ghddbwls22/224197291551');
    await page.waitForTimeout(2000);

    const childFrames = page.frames();

    let candidates = [];
    for (const f of childFrames) {
        if (f.url().includes('PostView')) {
            const dataLinks = await f.evaluate(() => {
                const results = [];
                document.querySelectorAll('[data-linkdata]').forEach(el => {
                    try {
                        const parsed = JSON.parse(el.getAttribute('data-linkdata'));
                        if (parsed.src && typeof parsed.src === 'string') {
                            results.push(parsed);
                        }
                    } catch (e) { }
                });
                return results;
            });
            candidates = dataLinks;
        }
    }
    
    await browser.close();

    for (const c of candidates.slice(0, 3)) {
        if (!c.src.includes('pstatic.net')) continue;
        console.log(`\nTesting image (orig W: ${c.originalWidth}): ${c.src.split('?')[0]}`);
        const base = c.src.split('?')[0];
        
        const testWidths = [c.originalWidth, '3000', '2000', '1920', '1080', '1000', 'w1', 'w2', 'w800'];
        for (const w of testWidths) {
            const isWFormat = String(w).startsWith('w');
            const param = isWFormat ? w : `w${w}`;
            await checkUrl(`${base}?type=${param}`, param);
        }
    }
})();
