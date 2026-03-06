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
    // let's test a very small image from the same blog post
    const base = 'https://www.reviewnote.co.kr/gongjeong/v2/image.webp?applyId=8eb73666-a880-4e9c-9f3c-83468ed4cdb0'; // this is external, wait
    const baseNav = 'https://postfiles.pstatic.net/MjAyNjAyMjZfNDMg/MDAxNzcyMTE1NjUwMzUx.IvDN1L8Acw5qOzUp7e0RLWDdTo2LZ42UuK54sGNdmKog.JTtjYvh_CsCXDnkO8zQGdqKkspPc_fI4hxb4lmBMcysg.JPEG/KakaoTalk_20260226_231838065_04.jpg'; // this orig width was 3000 too.
    
    // I need an image that is actually small. How about I just use w10000 on the 3000 image?
    console.log('Testing w10000 on robust image (orig 3000)');
    await checkUrl(`${baseNav}?type=w10000`, 'w10000');
    
    console.log('Testing w2000 on robust image (orig 3000)');
    await checkUrl(`${baseNav}?type=w2000`, 'w2000');

    console.log('Testing w3 on robust image (orig 3000)');
    await checkUrl(`${baseNav}?type=w3`, 'w3');
    
    // Test w2
    await checkUrl(`${baseNav}?type=w2`, 'w2');

})();
