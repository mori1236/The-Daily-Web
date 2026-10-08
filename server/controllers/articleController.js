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
