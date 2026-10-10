const { randomInt } = require('node:crypto');
const ArticleView = require('../models/article-view');
const Article = require('../models/article');
const { floorMinute } = require('./analytics');

const STRIPES = 16;

async function recordView(articleId, at = new Date()) {
    const minute = new Date(floorMinute(at));
    const stripe = randomInt(STRIPES);
    const key = `${articleId}:${minute.getTime()}:${stripe}`;
    const increment = { $inc: { count: 1 }, $setOnInsert: { article: articleId, minute, stripe } };
    try {
        await ArticleView.updateOne({ _id: key }, increment, { upsert: true });
    } catch (error) {
        // Two first readers can concurrently create the same counter. Retry the losing
        // insert as an increment; an atomic $inc never overwrites another reader's count.
        if (error.code !== 11000) throw error;
        await ArticleView.updateOne({ _id: key }, { $inc: { count: 1 } });
    }
    // Preserve the existing popularity ranking. Historical totals are not fabricated
    // into a timeline; recording starts on the first successfully served page.
    await Article.updateOne({ _id: articleId }, {
        $inc: { viewCount: 1 }, $min: { viewTrackingStartedAt: at },
    }, { timestamps: false });
}

module.exports = { recordView, STRIPES };
