const https = require('https');

async function checkUrl(url, label) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            console.log(`[${label}] Status: ${res.statusCode}, Content-Length: ${res.headers['content-length']}`);
            resolve(true);
        }).on('error', (e) => {
            console.error(`[${label}] Error:`, e.message);
            resolve(false);
        });
    });
}

(async () => {
    // 1st image
    const img1 = 'https://postfiles.pstatic.net/MjAyNjAyMjZfMTEz/MDAxNzcyMTE1NjUwMjUx.ykyXsIvKhDr-mBAiMDdDqbdXE_6sQrKoBy2Wmki9gA4g.fPD8HxlClnqARI6eD_cWtv4xqInaYBRumwT6i-8BoA0g.JPEG/KakaoTalk_20260226_231838065.jpg';
    console.log('\n--- img1 ---');
    await checkUrl(img1, 'none');
    await checkUrl(`${img1}?type=w1`, 'w1');
    await checkUrl(`${img1}?type=w2`, 'w2');
    await checkUrl(`${img1}?type=w800`, 'w800');

    // another image from another blog (the one I used yesterday)
    const img2 = 'https://blogfiles.pstatic.net/MjAyMzExMDNfMTMg/MDAxNjk4OTg1NzIyMzUw.xyz/image.jpg';
    console.log('\n--- img2 ---');
    // We already know this returned 404 because the signature was invalid, I need a live url.
    // I'll grab one from https://blog.naver.com/otrotro/224186823863
})();
