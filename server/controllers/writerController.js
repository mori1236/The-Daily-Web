const mongoose = require('mongoose');
const Article = require('../models/article');
const { ArticleTransitionError } = require('../errors');
const { sanitizeBody, cleanText, cleanUrl, MAX_LENGTHS } = require('../utils/sanitize');
const { DAY_MS, formatCount, formatTime, greetingFor, formatToday } = require('../utils/format');
const { titleSearchClauses } = require('../utils/search.utils');
const { STATE_VIEW, toArticleRow } = require('../utils/articles.utils');

const ARTICLES_PER_PAGE = 20;

function listUrl(status, q, page) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    if (page > 1) params.set('page', String(page));
    const query = params.toString();
    return query ? `/writer?${query}` : '/writer';
}

// ---------- handler ----------

// GET /writer?status=draft&q=title&page=2 — the writer's own articles.
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
    const writerId = req.user._id;

    // Filters come from the query string. Anything unexpected is ignored.
    const status = Article.STATES.includes(req.query.status) ? req.query.status : '';
    const q = String(req.query.q || '').trim().slice(0, 100);
    const requestedPage = Math.max(1, parseInt(String(req.query.page), 10) || 1);

    const filter = { writer: writerId };
    if (status) filter.state = status;
    if (q) filter.$and = titleSearchClauses(q); // every typed word must appear in the title

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // The queries only run when they are awaited, so Promise.all below runs them all together.
    //כמה בכל סטייט עבור הכותב הזה
    const stateGroupsTask = Article.aggregate([{ $match: { writer: writerId } }, { $group: { _id: '$state', count: { $sum: 1 } } }]);
    const draftsThisWeekTask = Article.countDocuments({ writer: writerId, state: 'draft', updatedAt: { $gte: new Date(now - 7 * DAY_MS) } });
    const pendingTodayTask = Article.countDocuments({ writer: writerId, state: 'pending', submitedAt: { $gte: new Date(now - DAY_MS) } });
    // Articles readers can see (even if a newer version is being edited right now).
    const liveGroupsTask = Article.aggregate([
        { $match: { writer: writerId, 'published.publishedAt': { $exists: true } } },
        { $group: {
            _id: null,
            count: { $sum: 1 }, // total published articles count
            views: { $sum: '$viewCount' }, // total views
            thisMonth: { $sum: { $cond: [{ $gte: ['$published.publishedAt', monthStart] }, 1, 0] } }, // published this month count
        } },
    ]);
    const matchingCountTask = Article.countDocuments(filter);

    const [stateGroups, draftsThisWeek, pendingToday, liveGroups, matchingCount] = await Promise.all([stateGroupsTask, draftsThisWeekTask, pendingTodayTask, liveGroupsTask, matchingCountTask]);

    const countByState = Object.fromEntries(stateGroups.map(group => [group._id, group.count]));
    const total = stateGroups.reduce((sum, group) => sum + group.count, 0);
    const live = liveGroups[0] || { count: 0, views: 0, thisMonth: 0 };

    const pages = Math.max(1, Math.ceil(matchingCount / ARTICLES_PER_PAGE));
    const page = Math.min(requestedPage, pages);
    const articles = await Article.find(filter)
        .select('title category state updatedAt viewCount published.updatedAt')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * ARTICLES_PER_PAGE)
        .limit(ARTICLES_PER_PAGE)
        .lean();

    res.render('writer', {
        firstName: req.user.name.split(' ')[0],
        greeting: greetingFor(now),
        today: formatToday(now),
        stats: {
            drafts: countByState.draft || 0,
            draftsThisWeek,
            pending: countByState.pending || 0,
            pendingToday,
            published: live.count,
            publishedTotal: total,
            publishedThisMonth: live.thisMonth,
            views: formatCount(live.views),
            viewsArticles: live.count,
        },
        chips: [
            { label: 'הכול', count: total, active: status === '', url: listUrl('', q, 1) },
            ...Article.STATES.map(state => ({
                label: STATE_VIEW[state].chipLabel,
                count: countByState[state] || 0,
                active: status === state,
                url: listUrl(state, q, 1),
            })),
        ],
        rows: articles.map(article => toArticleRow(article, now)),
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

// Which HTTP status each ArticleTransitionError reason becomes (see server/errors.js).
const ERROR_STATUS = { forbidden: 403, 'invalid-state': 409, 'invalid-input': 400 };

// Loads the article from the :id in the URL. Sends the answer and returns null when it can't be used.
async function findOwnArticle(req, res) {
    const article = mongoose.isValidObjectId(req.params.id) ? await Article.findById(req.params.id) : null;
    if (!article) {
        res.status(404).json({ error: 'הכתבה לא נמצאה' });
        return null;
    }
    return article;
}

// Sends the error of a failed action as JSON.
function sendApiError(res, err, logMessage) {
    if (err instanceof ArticleTransitionError) {
        console.warn(`${logMessage}: ${err.message}`);
        return res.status(ERROR_STATUS[err.reason] || 400).json({ error: err.message, reason: err.reason, missingFields: err.details.missingFields });
    }
    console.error(`${logMessage}:`, err);
    res.status(500).json({ error: 'אירעה שגיאה בשרת' });
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

        const body = req.body || {};
        const changes = {};
        if (body.title !== undefined) changes.title = cleanText(body.title, MAX_LENGTHS.title);
        if (body.summary !== undefined) changes.summary = cleanText(body.summary, MAX_LENGTHS.summary);
        if (body.content !== undefined) changes.content = sanitizeBody(body.content);
        if (body.imageUrl !== undefined) changes.imageUrl = cleanUrl(body.imageUrl);
        if (Article.CATEGORIES.includes(body.category)) changes.category = body.category;

        await article.setArticleContent(req.user, changes);
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
