const { siteUrl } = require('../config');

function articleSeo(article) {
    const canonical = new URL(article.url, siteUrl).href;
    const image = new URL(article.imageUrl, siteUrl).href;
    const description = (article.summary || article.title).replace(/\s+/g, ' ').trim();
    const published = new Date(article.publishedAt).toISOString();
    const modified = new Date(article.updatedAt || article.publishedAt).toISOString();
    const structuredData = {
        '@context': 'https://schema.org', '@type': 'NewsArticle',
        headline: article.title, description, image: [image],
        datePublished: published, dateModified: modified,
        author: { '@type': 'Person', name: article.writer },
        publisher: { '@type': 'Organization', name: 'The Daily Web', url: siteUrl },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        inLanguage: 'he', articleSection: article.categoryLabel,
    };
    return { canonical, image, description, published, modified,
        // Prevent article text from terminating the JSON-LD script element.
        structuredData: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
    };
}

module.exports = { articleSeo };
