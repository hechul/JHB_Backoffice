const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://blog.naver.com/ghddbwls22/224197291551');
    await page.waitForTimeout(2000);

    const childFrames = page.frames();

    for (const f of childFrames) {
        if (f.url().includes('PostView')) {
            const dataLinks = await f.evaluate(() => {
                const results = [];
                document.querySelectorAll('img[src*="postfiles"]').forEach(el => {
                    results.push({
                        id: el.id || 'no-id',
                        src: el.src,
                        dataLazy: el.getAttribute('data-lazy-src')
                    });
                });
                return results;
            });
            console.log('Img src tags:', JSON.stringify(dataLinks.slice(0, 5), null, 2));
        }
    }

    await browser.close();
})();
