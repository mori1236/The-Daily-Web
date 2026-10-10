const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildAnalytics, compareUpdate, MINUTE } = require('../utils/analytics');
const { recordView } = require('../utils/record-view');
const ArticleView = require('../models/article-view');
const Article = require('../models/article');
const controller = require('./analyticsController');
const { requireRoleHandler } = require('../middleware/auth');
const { makeAnalyticsViews, analyticsScenarios } = require('../seed');

const at = time => new Date(`2026-10-09T${time}:00Z`);
const events = [{ at: at('10:00') }, { at: at('14:00') }, { at: at('16:00') }];
const article = {
    _id: '000000000000000000000001', published: { title: 'News', publishedAt: at('10:00'), updatedAt: at('16:00') },
    publishEvents: events, viewCount: 1000, viewTrackingStartedAt: at('10:00'),
};
const minutes = Array.from({ length: 120 }, (_, i) => ({
    minute: new Date(Number(at('13:00')) + i * MINUTE), count: i < 60 ? 2 : 4,
}));

test('update comparison uses rates and equal complete windows around 14:00', () => {
    const comparison = compareUpdate(events[1], 1, events, minutes, at('10:00'), at('17:00'), at('10:00'));
    assert.equal(comparison.before.views, 120);
    assert.equal(comparison.after.views, 240);
    assert.equal(comparison.before.durationMinutes, 60);
    assert.equal(comparison.after.durationMinutes, 60);
    assert.equal(comparison.changePercent, 100);
});

test('mid-minute approvals exclude the mixed minute and neighbouring updates cap windows', () => {
    const tightEvents = [{ at: at('10:00') }, { at: new Date('2026-10-09T14:00:30Z') }, { at: at('14:10') }];
    const comparison = compareUpdate(tightEvents[1], 1, tightEvents, minutes, at('10:00'), at('17:00'), at('10:00'));
    assert.equal(comparison.before.to.toISOString(), at('14:00').toISOString());
    assert.equal(comparison.after.from.toISOString(), at('14:01').toISOString());
    assert.equal(comparison.after.durationMinutes, 9);
    assert.equal(comparison.after.views, 36);
    assert.equal(comparison.changePercent, 100);
});

test('unknown historical traffic is not presented as a zero-rate comparison', () => {
    const result = buildAnalytics({ ...article, viewTrackingStartedAt: undefined }, [], '24h', at('17:00'));
    assert.ok(result.points.every(point => !point.tracked));
    assert.ok(result.events.filter(event => event.comparison).every(event =>
        !event.comparison.comparable && event.comparison.before.viewsPerMinute === null && event.comparison.after.viewsPerMinute === null));
    assert.equal(result.article.totalViews, 1000);
});

test('timeline sums minutes into bounded bins, preserves exact approval timestamps, and zero-fills tracked gaps', () => {
    const result = buildAnalytics(article, minutes, '24h', at('17:00'));
    assert.equal(result.metrics.periodViews, 360);
    assert.equal(result.metrics.peakViewsPerMinute, 4);
    assert.equal(result.metrics.updates, 2);
    assert.equal(result.points.reduce((sum, point) => sum + point.views, 0), 360);
    assert.ok(result.points.length <= 289);
    assert.ok(result.points.some(point => point.tracked && point.views === 0));
    assert.equal(Number(result.events[1].at), Number(at('14:00')));
    assert.ok(buildAnalytics(article, [], '30d', at('17:00')).points.length <= 361);
});

test('no percentage is invented when the before rate is zero or there are no complete after minutes', () => {
    const zero = compareUpdate(events[1], 1, events, [], at('10:00'), at('17:00'), at('10:00'));
    assert.equal(zero.comparable, true);
    assert.equal(zero.changePercent, null);
    const pending = compareUpdate(events[1], 1, events, [], at('10:00'), new Date('2026-10-09T14:00:20Z'), at('10:00'));
    assert.equal(pending.after.viewsPerMinute, null);
    assert.equal(pending.comparable, false);
});

test('creation and update dates and full publication history survive a short chart range', () => {
    const fixture = { ...article, createdAt: at('09:00') };
    const now = new Date('2026-12-09T17:00:00Z');
    const short = buildAnalytics(fixture, [], '24h', now);
    assert.equal(short.events.length, 0);
    assert.equal(short.publicationHistory.length, 3);
    assert.ok(short.publicationHistory.every(event => !event.inRange));
    assert.equal(Number(short.article.createdAt), Number(at('09:00')));
    assert.equal(Number(short.article.lastPublishedUpdateAt), Number(at('16:00')));
    const full = buildAnalytics(fixture, [], 'all', now);
    assert.equal(full.events.length, 3);
    assert.equal(Number(full.from), Number(at('10:00')));
    assert.ok(full.points.length <= 361);
    const neverUpdated = buildAnalytics({ ...fixture, published: { ...fixture.published, updatedAt: at('10:00') } }, []);
    assert.equal(neverUpdated.article.lastPublishedUpdateAt, null);
});

test('counter creation races retry only the failed insert, without counting twice', async () => {
    const originalBucket = ArticleView.updateOne;
    const originalArticle = Article.updateOne;
    const calls = [];
    ArticleView.updateOne = async (filter, update, options) => {
        calls.push({ filter, update, options });
        if (calls.length === 1) throw Object.assign(new Error('duplicate'), { code: 11000 });
    };
    let totalIncrement;
    Article.updateOne = async (filter, update, options) => {
        totalIncrement = update;
        assert.equal(options.timestamps, false);
    };
    try {
        await recordView(article._id, new Date('2026-10-09T14:00:30Z'));
        assert.equal(calls.length, 2);
        assert.equal(calls[0].filter._id, calls[1].filter._id);
        assert.equal(calls[0].update.$setOnInsert.minute.toISOString(), at('14:00').toISOString());
        assert.equal(calls[0].update.$inc.count, 1);
        assert.deepEqual(calls[1].update, { $inc: { count: 1 } });
        assert.equal(totalIncrement.$inc.viewCount, 1);
    } finally {
        ArticleView.updateOne = originalBucket;
        Article.updateOne = originalArticle;
    }
});

test('analytics API rejects malformed article IDs and unsupported ranges before querying MongoDB', async () => {
    for (const [id, range] of [['bad', '24h'], [article._id, 'forever'], [article._id, '__proto__']]) {
        let status;
        await controller.getAnalytics({ params: { id }, query: { range } }, {
            status(code) { status = code; return this; }, json() {},
        });
        assert.equal(status, 400);
    }
});

test('the editor guard rejects guests and writers and allows editors', () => {
    const guard = requireRoleHandler('editor');
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        for (const [user, expected] of [[null, 401], [{ role: 'writer' }, 403], [{ role: 'editor' }, 200]]) {
            let status = 200;
            let allowed = false;
            guard({ user, originalUrl: '/api/editor/articles/1/analytics' }, {
                status(code) { status = code; return this; }, json() {},
            }, () => { allowed = true; });
            assert.equal(status, expected);
            assert.equal(allowed, expected === 200);
        }
    } finally { console.warn = originalWarn; }
});

test('seed scenarios generate reproducible minute views and comparisons for every demo update', () => {
    const end = at('17:00');
    const start = new Date(Number(end) - 20 * 60 * MINUTE);
    const fixture = { ...article, viewTrackingStartedAt: start, analyticsDemo: { key: 'demo', until: end },
        publishEvents: [start, ...[18, 8, 2].map(hours => new Date(Number(end) - hours * 60 * MINUTE))].map(at => ({ at })) };
    for (const scenario of analyticsScenarios) {
        const rows = makeAnalyticsViews(fixture, scenario);
        assert.equal(rows.length, 1200);
        assert.deepEqual(rows, makeAnalyticsViews(fixture, scenario));
        assert.ok(rows.every(row => row.count > 0 && Number(row.minute) < Number(end)));
        assert.equal(new Set(rows.map(row => row._id)).size, rows.length);
        const data = buildAnalytics(fixture, rows, '24h', end);
        assert.equal(data.article.isDemo, true);
        assert.ok(data.events.filter(event => event.comparison).every(event => event.comparison.comparable));
        const last = data.events.at(-1).comparison;
        if (scenario.key === 'growth') assert.ok(last.changePercent > 20);
        if (scenario.key === 'decline') assert.ok(last.changePercent < -20);
        if (scenario.key === 'steady') assert.ok(Math.abs(last.changePercent) < 10);
    }
});

test('article picker returns every published title without a 20-article page limit', async () => {
    const original = Article.find;
    const docs = Array.from({ length: 55 }, (_, i) => ({ _id: String(i), published: { title: `Article ${i}` } }));
    Article.find = filter => {
        assert.deepEqual(filter, { published: { $ne: null } });
        return {
            select(fields) { assert.equal(fields, 'published.title published.publishedAt'); return this; },
            sort() { return this; },
            lean: async () => docs,
        };
    };
    try {
        let result;
        await controller.getArticles({ query: {} }, { set() {}, json(value) { result = value; } });
        assert.equal(result.articles.length, 55);
        assert.equal(result.total, 55);
        assert.equal(result.articles.at(-1).id, '54');
    } finally { Article.find = original; }
});
