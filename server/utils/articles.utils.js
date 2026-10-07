// Helpers that turn articles into what the UI shows (labels, notes, table rows).

const Article = require('../models/article');
const { formatUpdated, formatCount, formatRelativeTime, estimateReadingTime } = require('./format');

/**
 * How each article state looks in the UI.
 * @type {Record<import('../models/article.js').ArticleState, { label: string, chipLabel: string, tone: string }>}
 */
const STATE_VIEW = {
    draft: { label: 'בהכנה', chipLabel: 'בהכנה', tone: 'neutral' },
    pending: { label: 'ממתינה לאישור', chipLabel: 'ממתינה', tone: 'warning' },
    published: { label: 'פורסמה', chipLabel: 'פורסמה', tone: 'success' },
    returned: { label: 'הוחזרה לתיקונים', chipLabel: 'הוחזרה', tone: 'danger' },
};

// The small grey sentence under the status badge.
function noteFor(article) {
    const hasLiveVersion = Boolean(article.published);
    switch (article.state) {
        case 'draft': return hasLiveVersion ? 'הגרסה המפורסמת עדיין באתר' : 'טיוטה נשמרה אוטומטית';
        case 'pending': return hasLiveVersion ? 'עדכון ממתין לעורך' : 'ממתינה לעורך';
        case 'returned': return 'יש הערה מהעורך';
        case 'published': return 'הגרסה העדכנית באתר';
    }
}

// One row of the writer's articles table.
function toArticleRow(article, now) {
    const state = STATE_VIEW[article.state];
    return {
        id: article._id,
        title: article.title || 'כתבה ללא כותרת',
        category: article.category ? Article.CATEGORY_LABELS[article.category] : 'ללא קטגוריה',
        stateLabel: state.label,
        stateTone: state.tone,
        note: noteFor(article),
        updated: formatUpdated(article.updatedAt, now),
        // Readers can only view articles that have a published version.
        views: article.published ? formatCount(article.viewCount) : '—',
        editUrl: `/writer/articles/${article._id}/edit`,
    };
}

// Transforms a published article into the data needed by the feed cards.
function toFeedArticle(article, now = new Date()) {
    const pub = article.published || article;
    const writerName = article.writer && article.writer.name ? article.writer.name : 'מערכת';
    const category = pub.category || 'news';
    const categoryLabel = Article.CATEGORY_LABELS[category] || 'כללי';
    const publishedAt = pub.publishedAt || article.createdAt || new Date();

    return {
        id: article._id.toString(),
        title: pub.title || 'כתבה ללא כותרת',
        summary: pub.summary || '',
        imageUrl: pub.imageUrl || '/img/login-newsroom.jpg',
        category,
        categoryLabel,
        writer: writerName,
        publishedAt,
        publishedAtFormatted: formatRelativeTime(publishedAt, now),
        viewCount: article.viewCount || 0,
        url: `/articles/${article._id}`,
        readingTime: estimateReadingTime(pub.content || pub.summary),
    };
}

module.exports = { STATE_VIEW, noteFor, toArticleRow, toFeedArticle };
