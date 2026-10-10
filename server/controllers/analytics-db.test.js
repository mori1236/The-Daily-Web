// Opt in: RUN_ANALYTICS_DB_TEST=true node --test server/controllers/analytics-db.test.js
// Creates its own temporary database on the configured LOCAL MongoDB, never the app database.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const Article = require('../models/article');
const ArticleView = require('../models/article-view');
const User = require('../models/user');
const { seedAnalytics } = require('../seed');
const { recordView } = require('../utils/record-view');
const analyticsController = require('./analyticsController');

test('1000 concurrent readers persist all views in minute counters', {
    skip: process.env.RUN_ANALYTICS_DB_TEST !== 'true', timeout: 60000,
}, async () => {
    const config = require('../config');
    assert.match(config.mongoUri, /^mongodb:\/\/(localhost|127\.0\.0\.1)(:|\/)/, 'Only a local test server is allowed');
    const dbName = `dailyweb_analytics_test_${randomUUID().replaceAll('-', '')}`;
    try {
        await mongoose.connect(config.mongoUri, { dbName, maxPoolSize: 50, serverSelectionTimeoutMS: 5000 });
        await Promise.all([Article.init(), ArticleView.init()]);
        const now = new Date();
        const article = await Article.create({ writer: new mongoose.Types.ObjectId(),
            published: { title: 'Concurrent view test', publishedAt: now, updatedAt: now } });
        await Promise.all(Array.from({ length: 1000 }, () => recordView(article._id, now)));
        const buckets = await ArticleView.find({ article: article._id }).lean();
        assert.equal(buckets.reduce((sum, bucket) => sum + bucket.count, 0), 1000);
        assert.ok(buckets.length <= 16);
        const refreshed = await Article.findById(article._id).lean();
        assert.equal(refreshed.viewCount, 1000);
        assert.equal(Number(refreshed.updatedAt), Number(article.updatedAt));
        assert.equal(Number(refreshed.viewTrackingStartedAt), Number(now));

        // Exercise the real aggregation, not only the write counters.
        let result;
        await analyticsController.getAnalytics({ params: { id: String(article._id) }, query: { range: '24h' } }, {
            set() {}, json(body) { result = body; }, status(code) { throw new Error(`Unexpected HTTP ${code}`); },
        });
        assert.equal(result.metrics.periodViews, 1000);
        assert.equal(result.metrics.peakViewsPerMinute, 1000);
        assert.equal(result.points.reduce((sum, point) => sum + point.views, 0), 1000);

        // Historical fixture data exists only in this disposable test database.
        const base = Math.floor((Number(now) - 3 * 60 * 60 * 1000) / 60000) * 60000;
        const approval = new Date(base + 60 * 60000);
        const edited = await Article.create({ writer: new mongoose.Types.ObjectId(), viewTrackingStartedAt: new Date(base),
            published: { title: 'Before / after update', publishedAt: new Date(base), updatedAt: approval },
            publishEvents: [{ at: new Date(base), editor: new mongoose.Types.ObjectId() }, { at: approval, editor: new mongoose.Types.ObjectId() }] });
        await ArticleView.insertMany(Array.from({ length: 120 }, (_, i) => ({
            _id: `${edited._id}:fixture:${i}`, article: edited._id, minute: new Date(base + i * 60000), stripe: 0, count: i < 60 ? 2 : 4,
        })));
        await analyticsController.getAnalytics({ params: { id: String(edited._id) }, query: { range: '24h' } }, {
            set() {}, json(body) { result = body; }, status(code) { throw new Error(`Unexpected HTTP ${code}`); },
        });
        assert.equal(result.metrics.periodViews, 360);
        assert.equal(result.events[1].comparison.changePercent, 100);

        // Seeding also works when the database already contains articles and views.
        const [fixtureWriter, fixtureEditor] = await User.create([
            { name: 'Fixture writer', email: 'writer@fixture.test', role: 'writer', passwordHash: 'fixture-only' },
            { name: 'Fixture editor', email: 'editor@fixture.test', role: 'editor', passwordHash: 'fixture-only' },
        ]);
        const legacy = await Article.create({
            title: 'Working draft', writer: fixtureWriter._id, state: 'draft', viewCount: 123,
            published: { title: 'Original seed article', content: 'זוהי כתבת דוגמה מספר 7, גרסה 2.',
                publishedAt: new Date(Number(now) - 2 * 86400000), updatedAt: new Date(Number(now) - 6 * 3600000) },
            publishEvents: [new Date(Number(now) - 2 * 86400000), new Date(Number(now) - 6 * 3600000)]
                .map(at => ({ at, editor: fixtureEditor._id })),
        });
        await recordView(legacy._id, new Date(Number(now) - 3600000));
        const realViews = await ArticleView.find({ article: legacy._id }).lean();
        await seedAnalytics();
        const demos = await Article.find({ 'analyticsDemo.key': /^impact-analytics-v1-/ }).lean();
        assert.equal(demos.length, 4);
        const updatedLegacy = await Article.findById(legacy._id).lean();
        assert.equal(updatedLegacy.published.title, legacy.published.title);
        assert.equal(updatedLegacy.published.content, legacy.published.content);
        assert.deepEqual(updatedLegacy.publishEvents.map(event => Number(event.at)), legacy.publishEvents.map(event => Number(event.at)));
        assert.equal(updatedLegacy.state, 'draft'); // Its published version still has analytics.
        assert.ok(updatedLegacy.viewCount > 124);
        assert.equal((await ArticleView.findById(realViews[0]._id)).count, 1);
        assert.ok(await ArticleView.countDocuments({ article: legacy._id, stripe: 16 }) > 0);
        assert.equal((await Article.findById(edited._id)).analyticsDemo, undefined); // Non-seed article.
        const totals = demos.map(doc => doc.viewCount);
        const bucketCount = await ArticleView.countDocuments();
        await seedAnalytics();
        assert.equal(await ArticleView.countDocuments(), bucketCount);
        const again = await Article.find({ 'analyticsDemo.key': /^impact-analytics-v1-/ }).lean();
        assert.deepEqual(again.map(doc => doc.viewCount), totals);
        assert.equal((await Article.findById(legacy._id)).viewCount, updatedLegacy.viewCount);
        await analyticsController.getAnalytics({ params: { id: String(legacy._id) }, query: { range: '24h' } }, {
            set() {}, json(body) { result = body; }, status(code) { throw new Error(`Unexpected HTTP ${code}`); },
        });
        assert.equal(result.article.isDemo, true);
        assert.ok(result.metrics.periodViews > 1);
        assert.equal(result.events[0].comparison.comparable, true);
        for (const demo of demos) {
            await analyticsController.getAnalytics({ params: { id: String(demo._id) }, query: { range: '24h' } }, {
                set() {}, json(body) { result = body; }, status(code) { throw new Error(`Unexpected HTTP ${code}`); },
            });
            assert.equal(result.article.isDemo, true);
            assert.equal(result.metrics.periodViews, demo.viewCount);
            assert.equal(result.events.filter(event => event.kind === 'update').length, 3);
            assert.ok(result.events.filter(event => event.comparison).every(event => event.comparison.comparable));
        }
    } finally {
        if (mongoose.connection.readyState === 1) {
            assert.equal(mongoose.connection.name, dbName);
            assert.match(dbName, /^dailyweb_analytics_test_[a-f0-9]{32}$/);
            await mongoose.connection.dropDatabase();
        }
        await mongoose.disconnect();
    }
});
