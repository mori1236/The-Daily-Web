const mongoose = require('mongoose');
const Article = require('../models/article');
const ArticleView = require('../models/article-view');
const { RANGES, rangeWindow, buildAnalytics } = require('../utils/analytics');

const summaryFields = 'published.title published.publishedAt published.updatedAt createdAt writer viewCount viewTrackingStartedAt publishEvents analyticsDemo';

async function listPublished(query = {}) {
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
    const filter = { published: { $ne: null } };
    if (q) filter['published.title'] = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    // Only compact picker metadata is loaded, never the article bodies. Every live
    // article must be selectable immediately, including articles with a newer draft.
    const docs = await Article.find(filter).select('published.title published.publishedAt')
        .sort({ 'published.publishedAt': -1, _id: -1 }).lean();
    return { articles: docs.map(doc => ({ id: String(doc._id), title: doc.published.title })),
        total: docs.length };
}

async function showAnalytics(req, res) {
    try {
        const list = await listPublished();
        let selected = list.articles[0] || null;
        if (typeof req.query.article === 'string' && /^[0-9a-fA-F]{24}$/.test(req.query.article)) {
            const article = await Article.findOne({ _id: req.query.article, published: { $ne: null } })
                .select('published.title').lean();
            if (article) selected = { id: String(article._id), title: article.published.title };
        }
        if (selected && !list.articles.some(article => article.id === selected.id)) list.articles.unshift(selected);
        res.render('analytics', { list, selected });
    } catch (error) {
        console.error('Analytics page failed:', error);
        res.status(500).render('auth-error', { message: 'אירעה שגיאה בטעינת הסטטיסטיקות', retryUrl: '/editor' });
    }
}

async function getArticles(req, res) {
    try {
        res.set('Cache-Control', 'private, no-store');
        res.json(await listPublished(req.query));
    } catch (error) {
        console.error('Analytics list failed:', error);
        res.status(500).json({ error: 'אירעה שגיאה בטעינת הכתבות' });
    }
}

async function getAnalytics(req, res) {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) return res.status(400).json({ error: 'מזהה כתבה לא תקין' });
    const range = req.query.range || '24h';
    if (!Object.prototype.hasOwnProperty.call(RANGES, range)) return res.status(400).json({ error: 'טווח זמן לא תקין' });
    try {
        const article = await Article.findOne({ _id: req.params.id, published: { $ne: null } })
            .select(summaryFields).populate('writer', 'name').populate('publishEvents.editor', 'name').lean();
        if (!article) return res.status(404).json({ error: 'לא נמצאה כתבה מפורסמת' });
        const now = new Date();
        const start = new Date(rangeWindow(range, article, now).start);
        const minutes = await ArticleView.aggregate([
            { $match: { article: new mongoose.Types.ObjectId(req.params.id), minute: { $gte: start, $lte: now } } },
            { $group: { _id: '$minute', count: { $sum: '$count' } } },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, minute: '$_id', count: 1 } },
        ]).option({ maxTimeMS: 10000 });
        res.set('Cache-Control', 'private, no-store');
        res.json(buildAnalytics(article, minutes, range, now));
    } catch (error) {
        console.error('Analytics data failed:', error);
        res.status(500).json({ error: 'אירעה שגיאה בטעינת נתוני הצפייה' });
    }
}

module.exports = { showAnalytics, getArticles, getAnalytics };
