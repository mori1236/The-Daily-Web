const mongoose = require('mongoose');
const Article = require('../models/article');
const { sanitizeBody } = require('../utils/sanitize');
const { formatCount, formatTime, greetingFor, formatToday } = require('../utils/format');
const { STATE_VIEW, toArticleRow, readContentChanges } = require('../utils/articles.utils');
const { sendApiError } = require('../utils/api-errors');
const query = require('../API/writer/query');

function listUrl(status, q, page) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    if (page > 1) params.set('page', String(page));
    const queryString = params.toString();
    return queryString ? `/writer?${queryString}` : '/writer';
}

// ---------- handler ----------

// GET /writer?status=draft&q=title&page=2
// Only the first render happens here (good for the first paint and for browsers without JavaScript).
// After that public/js/writer.js loads filters, search and pages from /api/writer (server/API/writer).
async function showDashboard(req, res) {
    try {
        await renderDashboard(req, res);
    } catch (err) {
        console.error('Writer dashboard error:', err);
        res.status(500).render('auth-error', {
            message: 'אירעה שגיאה בטעינת הכתבות',
            retryUrl: '/writer',
        });
    }
}

async function renderDashboard(req, res) {
    const now = new Date();
    const listQuery = query.parseListQuery(req.query);
    const { status, q } = listQuery;

    const [stats, list] = await Promise.all([query.getStats(req.user._id, now), query.listArticles(req.user._id, listQuery)]);
    const { page, pages } = list;

    res.render('writer', {
        firstName: req.user.name.split(' ')[0],
        greeting: greetingFor(now),
        today: formatToday(now),
        stats: {
            drafts: stats.countByState.draft,
            draftsThisWeek: stats.draftsThisWeek,
            pending: stats.countByState.pending,
            pendingToday: stats.pendingToday,
            published: stats.live.count,
            publishedTotal: stats.total,
            publishedThisMonth: stats.live.thisMonth,
            views: formatCount(stats.live.views),
            viewsArticles: stats.live.count,
        },
        chips: [
            { status: '', label: 'הכול', count: stats.total, active: status === '', url: listUrl('', q, 1) },
            ...Article.STATES.map(state => ({
                status: state,
                label: STATE_VIEW[state].chipLabel,
                tone: STATE_VIEW[state].tone,
                count: stats.countByState[state],
                active: status === state,
                url: listUrl(state, q, 1),
            })),
        ],
        rows: list.articles.map(article => toArticleRow(article, now)),
        filters: { status, q },
        pagination: {
            page,
            pages,
            prevUrl: page > 1 ? listUrl(status, q, page - 1) : null,
            nextUrl: page < pages ? listUrl(status, q, page + 1) : null,
        },
    });
}

// ---------- article editor ----------

// Loads the article from the :id in the URL. Sends the answer and returns null when it can't be used.
async function findOwnArticle(req, res) {
    const article = mongoose.isValidObjectId(req.params.id) ? await Article.findById(req.params.id) : null;
    if (!article) {
        res.status(404).json({ error: 'הכתבה לא נמצאה' });
        return null;
    }
    return article;
}

// POST /writer/articles — creates an empty draft and opens it in the editor.
async function createArticle(req, res) {
    try {
        const article = await Article.create({ writer: req.user._id });
        res.redirect(303, `/writer/articles/${article._id}/edit`);
    } catch (err) {
        console.error('Create article error:', err);
        res.status(500).render('auth-error', { message: 'אירעה שגיאה ביצירת הכתבה', retryUrl: '/writer' });
    }
}

// GET /writer/articles/:id/edit — the editor page with the latest saved working copy.
async function showEditor(req, res) {
    try {
        const article = mongoose.isValidObjectId(req.params.id) ? await Article.findById(req.params.id).lean() : null;
        if (!article) {
            return res.status(404).render('auth-error', { message: 'הכתבה לא נמצאה', retryUrl: '/writer', retryLabel: 'חזרה לכתבות שלי' });
        }
        if (!article.writer.equals(req.user._id)) {
            console.warn(`Forbidden: ${req.user.email} tried to open article ${article._id} of another writer`);
            return res.status(403).render('auth-error', { message: 'אין לך הרשאה לערוך את הכתבה הזו', retryUrl: '/writer', retryLabel: 'חזרה לכתבות שלי' });
        }

        const state = STATE_VIEW[article.state];
        res.render('writer-editor', {
            article,
            contentHtml: sanitizeBody(article.content), // cleaned again before it is printed as HTML
            state: { key: article.state, label: state.label, tone: state.tone },
            categories: Article.CATEGORIES.map(key => ({ key, label: Article.CATEGORY_LABELS[key] })),
            // Only the last version a writer can send is editable: a pending article waits for the editor.
            canEdit: ['draft', 'returned', 'published'].includes(article.state),
            savedAt: formatTime(article.updatedAt),
            saveUrl: `/api/writer/articles/${article._id}`,
            backUrl: '/writer',
            writerName: req.user.name, // a writer only opens their own articles
        });
    } catch (err) {
        console.error('Writer editor error:', err);
        res.status(500).render('auth-error', { message: 'אירעה שגיאה בטעינת הכתבה', retryUrl: '/writer' });
    }
}

// PATCH /api/writer/articles/:id — autosave. Only the fields in the body are changed.
async function saveArticle(req, res) {
    try {
        const article = await findOwnArticle(req, res);
        if (!article) return;

        await article.setArticleContent(req.user, readContentChanges(req.body));
        const state = STATE_VIEW[article.state];
        res.json({ state: article.state, stateLabel: state.label, stateTone: state.tone, savedAt: formatTime(article.updatedAt) });
    } catch (err) {
        sendApiError(res, err, 'Save article failed');
    }
}

// POST /api/writer/articles/:id/submit — draft or returned -> pending editor approval.
async function submitArticle(req, res) {
    try {
        const article = await findOwnArticle(req, res);
        if (!article) return;

        if (article.state === 'returned') await article.SubmitRejectFixNow(req.user);
        else await article.SubmitDraftNow(req.user);

        res.json({ state: article.state, redirectUrl: '/writer' });
    } catch (err) {
        sendApiError(res, err, 'Submit article failed');
    }
}

module.exports = { showDashboard, createArticle, showEditor, saveArticle, submitArticle };
