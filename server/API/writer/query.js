// Database queries for the writer's article list. Used by the page controller (first render)
// and by the JSON API routes (everything after that).

const Article = require('../../models/article');
const { DAY_MS } = require('../../utils/format');
const { titleSearchClauses } = require('../../utils/search.utils');

const ARTICLES_PER_PAGE = 20;

/**
 * @typedef {import('../../models/article.js').ArticleState} ArticleState
 * @typedef {{ status: ArticleState | '', q: string, page: number }} ListQuery
 */

/**
 * Reads the list filters from a query string (?status=draft&q=title&page=2).
 * Anything unexpected is ignored, so a bad query never breaks the page.
 * @param {Record<string, any>} query - req.query
 * @returns {ListQuery}
 */
function parseListQuery(query) {
    return {
        status: Article.STATES.includes(query.status) ? query.status : '',
        q: String(query.q || '').trim().slice(0, 100),
        page: Math.max(1, parseInt(String(query.page), 10) || 1),
    };
}

/**
 * Numbers for the summary cards and the filter chips.
 * @param {import('mongoose').Types.ObjectId} writerId
 * @param {Date} now
 */
async function getStats(writerId, now) {
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

    const [stateGroups, draftsThisWeek, pendingToday, liveGroups] = await Promise.all([stateGroupsTask, draftsThisWeekTask, pendingTodayTask, liveGroupsTask]);

    /** @type {Record<ArticleState, number>} */
    const countByState = Object.fromEntries(Article.STATES.map(state => [state, 0]));
    for (const group of stateGroups) countByState[group._id] = group.count;

    return {
        total: stateGroups.reduce((sum, group) => sum + group.count, 0),
        countByState,
        draftsThisWeek,
        pendingToday,
        live: liveGroups[0] || { count: 0, views: 0, thisMonth: 0 },
    };
}

/**
 * One page of the writer's own articles, newest update first.
 * `page` is limited to the last page, so the returned `page` can differ from the requested one.
 * @param {import('mongoose').Types.ObjectId} writerId
 * @param {ListQuery} listQuery
 */
async function listArticles(writerId, { status, q, page: requestedPage }) {
    const filter = { writer: writerId };
    if (status) filter.state = status;
    if (q) filter.$and = titleSearchClauses(q); // every typed word must appear in the title

    const total = await Article.countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / ARTICLES_PER_PAGE));
    const page = Math.min(requestedPage, pages);

    const articles = await Article.find(filter)
        .select('title category state updatedAt viewCount published.updatedAt')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * ARTICLES_PER_PAGE)
        .limit(ARTICLES_PER_PAGE)
        .lean();

    return { articles, total, page, pages };
}

module.exports = { ARTICLES_PER_PAGE, parseListQuery, getStats, listArticles };
