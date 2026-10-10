const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const ejs = require('ejs');
const { articleSeo } = require('../utils/article-seo');

test('article HTML includes SEO and full content without JavaScript, with safe JSON-LD and valid wrappers', async () => {
    const article = { id: '000000000000000000000001', title: 'כותרת </script>',
        summary: 'תקציר כתבה', writer: 'Writer', category: 'tech', categoryLabel: 'טכנולוגיה',
        publishedAt: new Date('2026-10-09T10:00:00Z'), updatedAt: new Date('2026-10-10T11:00:00Z'),
        imageUrl: '/img/login-newsroom.jpg', url: '/articles/000000000000000000000001',
        readingTime: 'דקה', viewCount: 10 };
    const seo = articleSeo(article);
    assert.equal(JSON.parse(seo.structuredData).headline, article.title);
    assert.ok(!seo.structuredData.includes('</script>'));
    assert.ok(seo.canonical.endsWith(article.url));
    const html = await ejs.renderFile(path.join(__dirname, '../../views/article.ejs'), {
        article, seo, fullContent: '<p>התוכן המלא נמצא בשרת</p>', comments: [], moreArticles: [], user: null,
    });
    assert.ok(html.includes('<p>התוכן המלא נמצא בשרת</p>'));
    assert.ok(html.includes('name="description"'));
    assert.ok(html.includes('rel="canonical"'));
    assert.ok(html.includes('application/ld+json'));
    assert.ok(html.includes('datetime="2026-10-10T11:00:00.000Z"'));
    assert.equal((html.match(/<body>/g) || []).length, 1);
    assert.equal((html.match(/<\/body>/g) || []).length, 1);
});
