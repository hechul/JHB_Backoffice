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
                        results.push(parsed);
                    } catch (e) { }
                });
                return results;
            });
            console.log('data-linkdata JSON attributes:');
            dataLinks.slice(0, 3).forEach(d => console.log(JSON.stringify(d, null, 2)));
        }
    }

    await browser.close();
})();
