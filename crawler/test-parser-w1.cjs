const { extractBlogMedia } = require('./lib/naver-parser.js');

(async () => {
    try {
        const url = 'https://blog.naver.com/ghddbwls22/224197291551';
        console.log(`Extracting media from ${url}...`);
        const mediaUrls = await extractBlogMedia(url);

        console.log(`Found ${mediaUrls.length} media URLs.`);
        console.log('Sample URLs:');
        mediaUrls.slice(0, 5).forEach((u, i) => console.log(`[${i}] ${u}`));

        // Verify type=w1 is present
        const hasW1 = mediaUrls.some(u => u.includes('type=w1'));
        console.log(`\nHas type=w1 parameter: ${hasW1 ? 'YES' : 'NO'}`);

    } catch (err) {
        console.error('Error:', err);
    }
})();
