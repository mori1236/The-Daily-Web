// Database queries for the editor's article list (all writers). Used by the page controller
// (first render) and by the JSON API routes (everything after that).

const mongoose = require('mongoose');
const Article = require('../../models/article');
const { titleSearchClauses } = require('../../utils/search.utils');
const { ARTICLES_PER_PAGE, parseListQuery } = require('../writer/query'); // the same filters: ?status=&q=&page=

/**
 * @typedef {import('../writer/query.js').ListQuery} ListQuery
 */

/**
 * Number of articles in each state, for the filter chips.
 * `all` is the total, which is the number behind the "all" chip.
 */
async function getCounts() {
    const groups = await Article.aggregate([{ $group: { _id: '$state', count: { $sum: 1 } } }]);

    const counts = Object.fromEntries(Article.STATES.map(state => [state, 0]));
    for (const group of groups) counts[group._id] = group.count;
    return { all: groups.reduce((sum, group) => sum + group.count, 0), ...counts };
}

/**
 * One page of articles from every writer. Pending articles are listed oldest submission first
 * (the one that waited longest is on top); every other list shows the latest update first.
 * `page` is limited to the last page, so the returned `page` can differ from the requested one.
 * @param {ListQuery} listQuery
 */
async function listArticles({ status, q, page: requestedPage }) {
    const filter = {};
    if (status) filter.state = status;
    if (q) filter.$and = titleSearchClauses(q); // every typed word must appear in the title

    const total = await Article.countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / ARTICLES_PER_PAGE));
    const page = Math.min(requestedPage, pages);

    const articles = await Article.find(filter)
        .select('title category state updatedAt writer published.publishedAt') // `published` only tells the list that a live version exists
        .sort(status === 'pending' ? { submitedAt: 1 } : { updatedAt: -1 })
        .skip((page - 1) * ARTICLES_PER_PAGE)
        .limit(ARTICLES_PER_PAGE)
        .populate('writer', 'name')
        .lean();

    return { articles, total, page, pages };
}

/**
 * One whole article with its writer's name, or null when the id is not valid or nothing is found.
 * A real document (not lean), so the editor actions can be called on it.
 * @param {string} id - the :id from the URL
 */
async function findArticle(id) {
    return mongoose.isValidObjectId(id) ? Article.findById(id).populate('writer', 'name') : null;
}

module.exports = { parseListQuery, getCounts, listArticles, findArticle };
