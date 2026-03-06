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
    // A 400x400 image from Naver search
    const base = 'https://blogfiles.pstatic.net/MjAyMzExMTlfMjE0/MDAxNzAwMzc0ODYwMDU1.aK-cKhy6Vv1Z5w5h_7w4z5_99999999.JPEG/test.jpg'; // Just a random guess? No, let me try a real image url.
    // Wait, let's use the one that failed:
    // https://blogfiles.pstatic.net/MjAyMzExMDNfMTMg/MDAxNjk4OTg1NzIyMzUw.xyz/image.jpg
    
    // I can just test an image I know is small if I can find one. 
    // Or I'll just change naver-parser.js to use w2000 as a primary, and if it fails, fallback?
    // The CDN generates types on the fly or pre-generates them.
    
    // Instead of testing a small image, I will write a script to fetch https://blog.naver.com/jhjjang56/224200703096 using my playwright script and print the data-linkdata and see if it drops the w2000.
})();
