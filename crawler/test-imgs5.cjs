const { chromium } = require('playwright');
const https = require('https');

async function checkUrl(url, label) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            console.log(`[${label}] Status: ${res.statusCode}, Content-Length: ${res.headers['content-length']}`);
            resolve(true);
        }).on('error', (e) => {
            resolve(false);
        });
    });
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://blog.naver.com/ghddbwls22/224197291551');
    await page.waitForTimeout(2000);

    const childFrames = page.frames();

    let foundUrl = null;
    for (const f of childFrames) {
        if (f.url().includes('PostView')) {
            const dataLinks = await f.evaluate(() => {
                const results = [];
                document.querySelectorAll('img[src*="postfiles"]').forEach(el => {
                    results.push(el.getAttribute('data-lazy-src') || el.src);
                });
                return results;
            });
            if (dataLinks.length > 0) {
                foundUrl = dataLinks[1]; // Use second image
            }
        }
    }

    await browser.close();

    if (foundUrl) {
        console.log('Found URL:', foundUrl);
        const base = foundUrl.split('?')[0];

        await checkUrl(base, 'original_no_type');
        await checkUrl(`${base}?type=w800`, 'w800');
        await checkUrl(`${base}?type=w2`, 'w2 (old original)');
        await checkUrl(`${base}?type=w3`, 'w3 (old full)');
        await checkUrl(`${base}?type=w1`, 'w1');
        await checkUrl(`${base}?type=w1000`, 'w1000');
    }
})();
