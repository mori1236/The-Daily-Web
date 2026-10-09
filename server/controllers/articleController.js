const Article = require('../models/article');
const User = require('../models/user');
const Comment = require('../models/comment');
const { formatComment } = require('./commentController');
const { toFeedArticle } = require('../utils/articles.utils');
const { formatTime } = require('../utils/format');
const { recordView } = require('../utils/record-view');

/**
 * Controller for public article feed and article details pages.
 */
const articleController = {
    /**
     * GET / — Renders the home page with initial 20 published articles and hero story.
     */
    async showFeed(req, res) {
        try {
            const now = new Date();
            const category = req.query.category;
            const sort = req.query.sort;
            const readStatus = req.query.readStatus;

            // Base filter for published articles
            /** @type {Record<string, any>} */
            const filter = { published: { $ne: null } };
            if (category && category !== 'all') {
                filter['published.category'] = category;
            }

            /** @type {Record<string, 1 | -1>} */
            let sortObj = { 'published.publishedAt': -1, _id: -1 };
            if (sort === 'popularity') {
                sortObj = { viewCount: -1, 'published.publishedAt': -1, _id: -1 };
            }

            // Find the hero story matching the category filter (or overall for 'all')
            const heroDoc = await Article.findOne(filter)
                .sort({ 'published.publishedAt': -1 })
                .populate('writer');

            // Find initial 20 published articles for first render
            const initialArticles = await Article.find(filter)
                .sort(sortObj)
                .limit(20)
                .populate('writer');

            res.render('index', {
                heroArticle: heroDoc ? toFeedArticle(heroDoc, now) : null,
                articles: initialArticles.map(a => toFeedArticle(a, now)),
                categories: Article.CATEGORIES,
                categoryLabels: Article.CATEGORY_LABELS,
                currentCategory: category || 'all',
                currentSort: sort || 'newest',
                currentReadFilter: readStatus || 'all',
                currentTime: formatTime(now),
            });
        } catch (err) {
            console.error('Error rendering feed:', err);
            res.status(500).send('שגיאת שרת פנימית');
        }
    },

    /**
     * GET/POST /api/articles — paginated feed; POST also accepts local read history.
     */
    async getFeedArticles(req, res) {
        try {
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
            const category = req.query.category;
            const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
            const sort = req.query.sort;

            /** @type {Record<string, any>} */
            const filter = { published: { $ne: null } };

            const readStatus = req.body?.readStatus || req.query.readStatus || 'all';
            const readIds = req.body?.readIds || [];
            if (!['all', 'read', 'unread'].includes(readStatus) ||
                !Array.isArray(readIds) ||
                !readIds.every(id => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id))) {
                return res.status(400).json({ error: 'Invalid read filter or article IDs' });
            }
            if (readStatus !== 'all') {
                filter._id = { [readStatus === 'read' ? '$in' : '$nin']: [...new Set(readIds)] };
            }

            if (category && category !== 'all') {
                filter['published.category'] = category;
            }

            if (q) {
                const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escaped, 'i');

                // Allow searching by writer name as well
                const matchingWriters = await User.find({ name: regex }).select('_id');
                const writerIds = matchingWriters.map(u => u._id);

                filter.$or = [
                    { 'published.title': regex },
                    { 'published.summary': regex },
                    ...(writerIds.length > 0 ? [{ writer: { $in: writerIds } }] : [])
                ];
            }

            /** @type {Record<string, 1 | -1>} */
            let sortObj = { 'published.publishedAt': -1, _id: -1 };
            if (sort === 'popularity') {
                sortObj = { viewCount: -1, 'published.publishedAt': -1, _id: -1 };
            }

            const skip = (page - 1) * limit;

            const [total, docs] = await Promise.all([
                Article.countDocuments(filter),
                Article.find(filter)
                    .sort(sortObj)
                    .skip(skip)
                    .limit(limit)
                    .populate('writer'),
            ]);

            const now = new Date();
            const articles = docs.map(d => toFeedArticle(d, now));

            // Return hero article for the active category filter on page 1
            let heroArticle = null;
            if (page === 1 && docs.length > 0) {
                heroArticle = articles[0];
            }

            res.json({
                heroArticle,
                articles,
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasMore: page * limit < total,
            });
        } catch (err) {
            console.error('API error (GET /api/articles):', err);
            res.status(500).json({ error: 'אירעה שגיאה בטעינת הכתבות' });
        }
    },

    /**
     * GET /articles/:id — Renders the full article page.
     */
    async showArticle(req, res) {
        try {
            const { id } = req.params;
            if (!id.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(404).render('auth-error', { message: 'הכתבה המבוקשת לא נמצאה' });
            }

            const articleDoc = await Article.findOne({ _id: id, published: { $ne: null } })
                .populate('writer');

            if (!articleDoc || !articleDoc.published) {
                return res.status(404).render('auth-error', { message: 'הכתבה המבוקשת לא נמצאה או שטרם פורסמה' });
            }

            const now = new Date();
            const article = toFeedArticle(articleDoc, now);

            // Fetch comments for the article
            const commentDocs = await Comment.find({ article: id }).sort({ createdAt: -1 });
            const comments = commentDocs.map(c => formatComment(c, now));

            // Fetch a few related / more articles from the same category or latest
            const moreDocs = await Article.find({
                _id: { $ne: articleDoc._id },
                published: { $ne: null },
            })
                .sort({ 'published.publishedAt': -1 })
                .limit(4)
                .populate('writer');

            const moreArticles = moreDocs.map(d => toFeedArticle(d, now));

            // Count only successfully served GET pages; HEAD/failed renders are not views.
            res.once('finish', () => {
                if (req.method === 'GET' && res.statusCode === 200) {
                    recordView(articleDoc._id, new Date()).catch(err => console.error('View tracking failed:', err));
                }
            });
            res.render('article', {
                article,
                comments,
                fullContent: articleDoc.published.content || articleDoc.published.summary || '',
                moreArticles,
                currentCategory: article.category, // highlights the article's category in the header nav
            });
        } catch (err) {
            console.error('Error showing article:', err);
            res.status(500).send('שגיאת שרת פנימית');
        }
    },
};

module.exports = articleController;
