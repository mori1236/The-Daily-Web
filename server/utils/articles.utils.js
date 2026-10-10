// Helpers that turn articles into what the UI shows (labels, notes, table rows).

const Article = require('../models/article');
const { formatUpdated, formatCount, formatRelativeTime, estimateReadingTime } = require('./format');
const { sanitizeBody, cleanText, cleanUrl, MAX_LENGTHS } = require('./sanitize');

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
        imageUrl: pub.imageUrl?.trim() || '/img/default-article.jpg',
        category,
        categoryLabel,
        writer: writerName,
        publishedAt,
        updatedAt: pub.updatedAt || publishedAt,
        publishedAtFormatted: formatRelativeTime(publishedAt, now),
        viewCount: article.viewCount || 0,
        url: `/articles/${article._id}`,
        readingTime: estimateReadingTime(pub.content || pub.summary),
    };
}

// ---------- editor area ----------

// The small grey sentence under an article in the editor's list.
function queueNoteFor(article) {
    const hasLiveVersion = Boolean(article.published);
    switch (article.state) {
        case 'draft': return hasLiveVersion ? 'הכתב/ת מעדכן/ת כתבה שפורסמה' : 'הכתב/ת עדיין כותב/ת';
        case 'pending': return hasLiveVersion ? 'עדכון לכתבה שפורסמה' : 'כתבה חדשה';
        case 'returned': return 'ממתינה לתיקוני הכתב/ת';
        case 'published': return 'הגרסה העדכנית באתר';
    }
}

// One item of the editor's article list. `article.writer` must be loaded with populate.
function toQueueRow(article, now) {
    const state = STATE_VIEW[article.state];
    return {
        id: article._id,
        title: article.title || 'כתבה ללא כותרת',
        category: article.category ? Article.CATEGORY_LABELS[article.category] : 'ללא קטגוריה',
        writerName: article.writer ? article.writer.name : '—',
        stateLabel: state.label,
        stateTone: state.tone,
        note: queueNoteFor(article),
        updated: formatUpdated(article.updatedAt, now),
    };
}

// One version of an article (the published one or the working copy) as the review panel shows it.
function toVersion(source, label, meta) {
    return {
        label,
        meta,
        title: source.title || 'כתבה ללא כותרת',
        summary: source.summary,
        contentHtml: sanitizeBody(source.content), // cleaned again before it is printed as HTML
        imageUrl: source.imageUrl,
    };
}

// What the editor's review panel shows for one article. `article.writer` must be loaded with populate.
// Readers see `published`; the writer's working copy is the new version waiting for a decision.
function toReview(article, now) {
    const state = STATE_VIEW[article.state];
    const category = article.category ? Article.CATEGORY_LABELS[article.category] : 'ללא קטגוריה';
    const writerName = article.writer ? article.writer.name : '—';
    const isPending = article.state === 'pending';
    return {
        id: article._id,
        title: article.title || article.published?.title || 'כתבה ללא כותרת',
        meta: `${writerName} · ${category}`,
        stateLabel: state.label,
        stateTone: state.tone,
        // The editor can only decide on, or edit, an article that waits for approval.
        canReview: isPending,
        canEdit: isPending,
        editUrl: `/editor/articles/${article._id}/edit`,
        returnedNote: article.state === 'returned' ? article.editorRejectNote || '' : '',
        published: article.published
            ? toVersion(article.published, 'גרסה מפורסמת', `פורסמה ${formatUpdated(article.published.updatedAt, now)}`)
            : null,
        // A published article has no newer version: its working copy is the same as the published one.
        draft: article.state === 'published'
            ? null
            : toVersion(article, article.published ? 'גרסה חדשה' : 'גרסת הכתב/ת', `עודכנה ${formatUpdated(article.updatedAt, now)}`),
    };
}

// The review panel before the editor opens an article (the page renders it hidden).
const EMPTY_REVIEW = {
    id: '', title: '', meta: '', stateLabel: '', stateTone: 'neutral',
    canReview: false, canEdit: false, editUrl: '#', returnedNote: '', published: null, draft: null,
};

// ---------- saving ----------

/**
 * Reads the fields a writer or an editor changed in the editor page (autosave body).
 * Every field is cleaned here, and fields that were not sent stay out of the result.
 * @param {Record<string, any> | undefined} body - req.body
 * @returns {import('../models/article.js').ContentChanges}
 */
function readContentChanges(body) {
    const sent = body || {};
    const changes = {};
    if (sent.title !== undefined) changes.title = cleanText(sent.title, MAX_LENGTHS.title);
    if (sent.summary !== undefined) changes.summary = cleanText(sent.summary, MAX_LENGTHS.summary);
    if (sent.content !== undefined) changes.content = sanitizeBody(sent.content);
    if (sent.imageUrl !== undefined) changes.imageUrl = cleanUrl(sent.imageUrl);
    if (Article.CATEGORIES.includes(sent.category)) changes.category = sent.category;
    return changes;
}

module.exports = { STATE_VIEW, noteFor, toArticleRow, toQueueRow, toReview, EMPTY_REVIEW, readContentChanges, toFeedArticle };
