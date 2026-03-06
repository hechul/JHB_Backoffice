const https = require('https');

async function checkUrl(url, label) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            console.log(`[${label}] URL: ${url}`);
            console.log(`[${label}] Status: ${res.statusCode}, Content-Length: ${res.headers['content-length']}`);
            resolve(true);
        }).on('error', (e) => {
            console.error(`[${label}] Error:`, e.message);
            resolve(false);
        });
    });
}

(async () => {
    const base = 'https://postfiles.pstatic.net/MjAyNjAyMjZfMTEz/MDAxNzcyMTE1NjUwMjUx.ykyXsIvKhDr-mBAiMDdDqbdXE_6sQrKoBy2Wmki9gA4g.fPD8HxlClnqARI6eD_cWtv4xqInaYBRumwT6i-8BoA0g.JPEG/KakaoTalk_20260226_231838065.jpg';
    await checkUrl(base, 'original_no_type');
    await checkUrl(`${base}?type=w800`, 'w800');
    await checkUrl(`${base}?type=w3000`, 'w3000');
})();
