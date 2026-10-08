const mongoose = require('mongoose');
const Article = require('../models/article');
const { sanitizeBody } = require('../utils/sanitize');
const { formatTime } = require('../utils/format');
const { STATE_VIEW, toQueueRow, toReview, EMPTY_REVIEW, readContentChanges } = require('../utils/articles.utils');
const { sendApiError } = require('../utils/api-errors');
const query = require('../API/editor/query');

const MAX_NOTE_LENGTH = 1000;
// The order of the filter chips: what needs a decision comes first.
const CHIP_STATES = ['pending', 'returned', 'draft', 'published'];

function queueUrl({ status, q, page, article }) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    if (page > 1) params.set('page', String(page));
    if (article) params.set('article', String(article));
    const queryString = params.toString();
    return queryString ? `/editor?${queryString}` : '/editor';
}

// ---------- queue page ----------

// GET /editor?status=pending&q=title&page=2&article=<id>
// Only the first render happens here (good for the first paint and for browsers without JavaScript).
// After that public/js/editor.js loads filters, search, pages and the review panel from /api/editor (server/API/editor).
async function showQueue(req, res) {
    try {
        await renderQueue(req, res);
    } catch (err) {
        console.error('Editor queue error:', err);
        res.status(500).render('auth-error', {
            message: 'אירעה שגיאה בטעינת הכתבות',
            retryUrl: '/editor',
        });
    }
}

async function renderQueue(req, res) {
    const now = new Date();
    const listQuery = query.parseListQuery(req.query);
    const { status, q } = listQuery;

    const [counts, list, selected] = await Promise.all([
        query.getCounts(),
        query.listArticles(listQuery),
        query.findArticle(String(req.query.article || '')),
    ]);
    const { page, pages } = list;
    const articleId = selected ? String(selected._id) : '';

    res.render('editor', {
        counts,
        chips: [
            { status: '', label: 'הכול', count: counts.all, active: status === '', url: queueUrl({ q, article: articleId }) },
            ...CHIP_STATES.map(state => ({
                status: state,
                label: STATE_VIEW[state].chipLabel,
                tone: STATE_VIEW[state].tone,
                count: counts[state],
                active: status === state,
                url: queueUrl({ status: state, q, article: articleId }),
            })),
        ],
        rows: list.articles.map(article => {
            const row = toQueueRow(article, now);
            return { ...row, url: queueUrl({ status, q, page, article: row.id }), selected: String(row.id) === articleId };
        }),
        filters: { status, q },
        total: list.total,
        pagination: {
            page,
            pages,
            prevUrl: page > 1 ? queueUrl({ status, q, page: page - 1, article: articleId }) : null,
            nextUrl: page < pages ? queueUrl({ status, q, page: page + 1, article: articleId }) : null,
        },
        review: selected ? toReview(selected, now) : EMPTY_REVIEW,
        hasReview: Boolean(selected),
    });
}

// ---------- editing an article ----------

// GET /editor/articles/:id/edit — the same page the writer uses, for the editor.
async function showEditor(req, res) {
    try {
        const article = await query.findArticle(req.params.id);
        if (!article) {
            return res.status(404).render('auth-error', { message: 'הכתבה לא נמצאה', retryUrl: '/editor', retryLabel: 'חזרה לתור האישורים' });
        }

        const state = STATE_VIEW[article.state];
        res.render('writer-editor', {
            article,
            contentHtml: sanitizeBody(article.content), // cleaned again before it is printed as HTML
            state: { key: article.state, label: state.label, tone: state.tone },
            categories: Article.CATEGORIES.map(key => ({ key, label: Article.CATEGORY_LABELS[key] })),
            // An editor can only edit an article that waits for approval (see Article.setArticleContent).
            canEdit: article.state === 'pending',
            savedAt: formatTime(article.updatedAt),
            saveUrl: `/api/editor/articles/${article._id}`,
            backUrl: queueUrl({ article: article._id }),
            writerName: article.writer ? article.writer.name : '—',
        });
    } catch (err) {
        console.error('Editor article page error:', err);
        res.status(500).render('auth-error', { message: 'אירעה שגיאה בטעינת הכתבה', retryUrl: '/editor' });
    }
}

// ---------- actions (JSON) ----------

// Loads the article from the :id in the URL. Sends the answer and returns null when it can't be used.
async function findArticleOr404(req, res) {
    const article = await query.findArticle(req.params.id);
    if (!article) {
        res.status(404).json({ error: 'הכתבה לא נמצאה' });
        return null;
    }
    return article;
}

// PATCH /api/editor/articles/:id — autosave while the editor edits a pending article.
async function saveArticle(req, res) {
    try {
        const article = await findArticleOr404(req, res);
        if (!article) return;

        await article.setArticleContent(req.user, readContentChanges(req.body));
        const state = STATE_VIEW[article.state];
        res.json({ state: article.state, stateLabel: state.label, stateTone: state.tone, savedAt: formatTime(article.updatedAt) });
    } catch (err) {
        sendApiError(res, err, 'Editor save article failed');
    }
}

// POST /api/editor/articles/:id/publish — pending -> published.
async function publishArticle(req, res) {
    try {
        const article = await findArticleOr404(req, res);
        if (!article) return;

        await article.PublishNow(req.user);
        console.log(`Article ${article._id} published by ${req.user.email}`);
        res.json({ review: toReview(article, new Date()) });
    } catch (err) {
        sendApiError(res, err, 'Publish article failed');
    }
}

// POST /api/editor/articles/:id/return — pending -> returned, with a note for the writer.
async function returnArticle(req, res) {
    try {
        const article = await findArticleOr404(req, res);
        if (!article) return;

        const note = String(req.body?.note || '').slice(0, MAX_NOTE_LENGTH);
        await article.Reject(req.user, note);
        console.log(`Article ${article._id} returned to the writer by ${req.user.email}`);
        res.json({ review: toReview(article, new Date()) });
    } catch (err) {
        sendApiError(res, err, 'Return article failed');
    }
}

// DELETE /api/editor/articles/:id — removes the article in any state.
async function deleteArticle(req, res) {
    try {
        const article = await findArticleOr404(req, res);
        if (!article) return;

        await article.DeleteNow(req.user);
        console.log(`Article ${article._id} deleted by ${req.user.email}`);
        res.json({ deleted: true });
    } catch (err) {
        sendApiError(res, err, 'Delete article failed');
    }
}

module.exports = { showQueue, showEditor, saveArticle, publishArticle, returnArticle, deleteArticle };
