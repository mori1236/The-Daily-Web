const Article = require('../models/article');
const { DAY_MS, formatCount, greetingFor, formatToday } = require('../utils/format');
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

module.exports = { showDashboard };
