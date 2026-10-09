// Regression tests for filtering before pagination; no running MongoDB required.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Article = require('../models/article');
const User = require('../models/user');
const controller = require('./articleController');

test('read history filters the dataset before pagination and counting', async () => {
    const originals = { find: Article.find, count: Article.countDocuments, users: User.find };
    const docs = Array.from({ length: 100 }, (_, i) => ({
        _id: (i + 1).toString(16).padStart(24, '0'),
        published: { title: 'News', category: 'tech', publishedAt: new Date(100000 - i) },
        writer: { name: 'Writer' },
    }));
    const readIds = docs.slice(0, 78).map(d => d._id);
    function matching(filter) {
        assert.deepEqual(filter.published, { $ne: null });
        return docs.filter(d => !filter._id || (filter._id.$in
            ? filter._id.$in.includes(d._id) : !filter._id.$nin.includes(d._id)));
    }
    Article.countDocuments = async filter => matching(filter).length;
    Article.find = filter => {
        let results = matching(filter);
        return {
            sort(order) { assert.equal(order._id, -1); return this; },
            skip(n) { results = results.slice(n); return this; },
            limit(n) { results = results.slice(0, n); return this; },
            async populate() { return results; },
        };
    };
    User.find = () => ({ select: async () => [] });
    async function request(body, query = {}) {
        let status = 200;
        let data;
        await controller.getFeedArticles({ body, query }, {
            status(code) { status = code; return this; },
            json(value) { data = value; },
        });
        return { status, data };
    }
    try {
        const first = await request({ readStatus: 'unread', readIds });
        assert.equal(first.data.articles.length, 20);
        assert.equal(first.data.articles[0].id, docs[78]._id);
        assert.equal(first.data.total, 22);
        assert.equal(first.data.hasMore, true);
        const second = await request({ readStatus: 'unread', readIds }, { page: '2', sort: 'popularity' });
        assert.equal(second.data.articles.length, 2);
        assert.equal(second.data.hasMore, false);
        assert.equal(new Set([...first.data.articles, ...second.data.articles].map(a => a.id)).size, 22);
        const read = await request({ readStatus: 'read', readIds });
        assert.equal(read.data.total, 78);
        assert.ok(read.data.articles.every(a => readIds.includes(a.id)));
        assert.equal((await request({ readStatus: 'read', readIds: [] })).data.total, 0);
        assert.equal((await request({ readStatus: 'unread', readIds: [] })).data.total, 100);
        assert.equal((await request({ readStatus: 'all', readIds })).data.total, 100);
        assert.equal((await request({ readStatus: 'read', readIds: ['invalid'] })).status, 400);
        assert.equal((await request({ readStatus: 'read', readIds: {} })).status, 400);
        assert.equal((await request({ readStatus: 'other' })).status, 400);
        assert.equal((await request(undefined)).data.total, 100); // Existing GET clients.
    } finally {
        Article.find = originals.find;
        Article.countDocuments = originals.count;
        User.find = originals.users;
    }
});
