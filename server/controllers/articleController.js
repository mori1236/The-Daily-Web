const Article = require('../models/article');
const User = require('../models/user');
const { toFeedArticle } = require('../utils/articles.utils');
const { formatTime } = require('../utils/format');

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
            let sortObj = { 'published.publishedAt': -1 };
            if (sort === 'popularity') {
                sortObj = { viewCount: -1, 'published.publishedAt': -1 };
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
     * GET /api/articles — JSON endpoint for Ajax search, filter, and infinite scroll (20 per page).
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
            let sortObj = { 'published.publishedAt': -1 };
            if (sort === 'popularity') {
                sortObj = { viewCount: -1, 'published.publishedAt': -1 };
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

            // Increment view count asynchronously
            Article.updateOne({ _id: id }, { $inc: { viewCount: 1 } }).exec();

            const now = new Date();
            const article = toFeedArticle(articleDoc, now);

            // Fetch a few related / more articles from the same category or latest
            const moreDocs = await Article.find({
                _id: { $ne: articleDoc._id },
                published: { $ne: null },
            })
                .sort({ 'published.publishedAt': -1 })
                .limit(4)
                .populate('writer');

            const moreArticles = moreDocs.map(d => toFeedArticle(d, now));

            res.render('article', {
                article,
                fullContent: articleDoc.published.content || articleDoc.published.summary || '',
                moreArticles,
            });
        } catch (err) {
            console.error('Error showing article:', err);
            res.status(500).send('שגיאת שרת פנימית');
        }
    },
};

module.exports = articleController;
