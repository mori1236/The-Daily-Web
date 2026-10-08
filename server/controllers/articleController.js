const mongoose = require('mongoose');
const Article = require('../models/article');

async function showArticle(req, res, next) {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).send('הכתבה לא נמצאה');
        }

        const article = await Article.findOne({
            _id: id,
            state: 'published',
            published: { $ne: null },
        }).populate('writer', 'name');

        if (!article) return res.status(404).send('הכתבה לא נמצאה');

        await Article.updateOne(
            { _id: article._id, state: 'published' },
            { $inc: { viewCount: 1 } }
        );
        article.viewCount += 1;

        const published = article.published;
        const canonicalUrl = `${req.protocol}://${req.get('host')}/articles/${article._id}`;

        res.render('article', {
            article,
            title: published.title,
            description: published.summary,
            canonicalUrl,
            imageUrl: published.imageUrl,
            styles: ['article'],
        });
    } catch (error) {
        next(error);
    }
}

module.exports = { showArticle };

async function addReadingTime(req, res, next) {
    try {
        const { id } = req.params;
        const seconds = Number(req.body.seconds);

        if (!mongoose.Types.ObjectId.isValid(id) || seconds !== 5) {
            return res.status(400).json({ error: 'נתוני זמן קריאה לא תקינים' });
        }

        const result = await Article.updateOne(
            { _id: id, state: 'published', published: { $ne: null } },
            { $inc: { readTimeSeconds: 5 } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'הכתבה לא נמצאה' });
        }

        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
}

module.exports.addReadingTime = addReadingTime;
