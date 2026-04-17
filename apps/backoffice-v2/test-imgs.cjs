const { extractBlogMedia } = require('./crawler/lib/naver-parser.js');

async function test() {
    console.log('Testing final extraction on ghddbwls22...');
    const urls = await extractBlogMedia('https://blog.naver.com/ghddbwls22/224197291551');

    const imgs = urls.filter(u => u.includes('pstatic.net') && !u.includes('mp4') && !u.includes('m3u8'));
    const mp4s = urls.filter(u => u.includes('mp4'));
    console.log('Total URLs found:', urls.length);
    console.log('Total Images:', imgs.length);
    console.log('Total MP4s:', mp4s.length);

    if (imgs.length > 0) {
        console.log('Sample Image URLs:');
        imgs.slice(0, 3).forEach(u => console.log(u));
    }
}
test().catch(console.error);
