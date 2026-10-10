const assert = require('node:assert/strict');
const { test } = require('node:test');
const Article = require('../models/article');
const Comment = require('../models/comment');
const controller = require('./articleController');

test('article display includes the current GET view without changing the stored snapshot or HEAD count', async t => {
    const doc = { _id: '000000000000000000000001', viewCount: 9,
        published: { title: 'News', publishedAt: new Date(), content: 'Article' } };
    t.mock.method(Article, 'findOne', () => ({ populate: async () => doc }));
    t.mock.method(Comment, 'find', () => ({ sort: async () => [] }));
    t.mock.method(Article, 'find', () => ({
        sort() { return this; }, limit() { return this; }, populate: async () => [],
    }));
    for (const method of ['GET', 'HEAD']) {
        let displayed;
        let finishHandler;
        await controller.showArticle({ params: { id: doc._id }, method }, {
            once(event, callback) { assert.equal(event, 'finish'); finishHandler = callback; },
            render(view, locals) { assert.equal(view, 'article'); displayed = locals.article.viewCount; },
        }, error => { throw error; });
        assert.equal(displayed, method === 'GET' ? 10 : 9);
        assert.equal(doc.viewCount, 9);
        assert.equal(typeof finishHandler, 'function');
    }
});
