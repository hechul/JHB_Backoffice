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
                document.querySelectorAll('[data-linkdata]').forEach(el => {
                    try {
                        const parsed = JSON.parse(el.getAttribute('data-linkdata'));
                        if (parsed.src && typeof parsed.src === 'string') {
                            results.push(parsed.src);
                        }
                    } catch (e) { }
                });
                return results;
            });
            console.log('Original src in data-linkdata:', dataLinks.slice(0, 3));
        }
    }

    await browser.close();
})();
