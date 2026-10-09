const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const RANGES = {
    '24h': { duration: 24 * HOUR, interval: 5 * MINUTE },
    '7d': { duration: 7 * 24 * HOUR, interval: 30 * MINUTE },
    '30d': { duration: 30 * 24 * HOUR, interval: 2 * HOUR },
    all: { duration: null, interval: null },
};

function floorMinute(value) { return Math.floor(Number(value) / MINUTE) * MINUTE; }
function ceilMinute(value) { return Math.ceil(Number(value) / MINUTE) * MINUTE; }

function rangeWindow(range, article, now) {
    const start = range === 'all'
        ? floorMinute(new Date(article.published.publishedAt))
        : floorMinute(Number(now) - RANGES[range].duration);
    const interval = range === 'all'
        ? Math.max(5 * MINUTE, Math.ceil((Number(now) - start) / (360 * MINUTE)) * MINUTE)
        : RANGES[range].interval;
    return { start, interval };
}

// Comparison uses whole minutes only. The minute containing a mid-minute approval is
// excluded, so its views cannot be incorrectly attributed to before or after the update.
function compareUpdate(event, index, events, minutes, start, end, trackingStart) {
    const at = Number(new Date(event.at));
    const previous = index > 0 ? Number(new Date(events[index - 1].at)) : at;
    const next = events[index + 1] ? Number(new Date(events[index + 1].at)) : end;
    const beforeEnd = floorMinute(at);
    const beforeStart = Math.max(beforeEnd - HOUR, ceilMinute(previous), ceilMinute(start), ceilMinute(trackingStart));
    const afterBoundary = ceilMinute(at);
    const afterStart = Math.max(afterBoundary, ceilMinute(trackingStart), ceilMinute(start));
    const afterEnd = Math.min(afterBoundary + HOUR, floorMinute(next), floorMinute(end));
    function window(from, to) {
        const durationMinutes = Math.max(0, (to - from) / MINUTE);
        const views = durationMinutes > 0
            ? minutes.filter(row => Number(row.minute) >= from && Number(row.minute) < to)
                .reduce((sum, row) => sum + row.count, 0) : 0;
        return { from: new Date(from), to: new Date(Math.max(from, to)), durationMinutes, views,
            viewsPerMinute: durationMinutes > 0 ? views / durationMinutes : null };
    }
    const before = window(beforeStart, beforeEnd);
    const after = window(afterStart, afterEnd);
    const comparable = before.durationMinutes > 0 && after.durationMinutes > 0;
    const changePercent = comparable && before.viewsPerMinute > 0
        ? (after.viewsPerMinute / before.viewsPerMinute - 1) * 100 : null;
    return { before, after, comparable, changePercent };
}

function buildAnalytics(article, minutes, range = '24h', now = new Date()) {
    const { start, interval } = rangeWindow(range, article, now);
    const end = Number(now);
    const trackingStart = article.viewTrackingStartedAt ? Number(new Date(article.viewTrackingStartedAt)) : end;
    const bins = new Map();
    for (const row of minutes) {
        const at = Number(row.minute);
        const key = start + Math.floor((at - start) / interval) * interval;
        bins.set(key, (bins.get(key) || 0) + row.count);
    }
    const points = [];
    for (let at = start; at < end; at += interval) {
        const to = Math.min(at + interval, end);
        points.push({ at: new Date(at), to: new Date(to), views: bins.get(at) || 0,
            tracked: Boolean(article.viewTrackingStartedAt) && to > trackingStart });
    }
    const events = [...(article.publishEvents || [])].sort((a, b) => Number(new Date(a.at)) - Number(new Date(b.at)));
    // Legacy articles may have published timestamps without a publishEvents history.
    if (!events.length && article.published) {
        events.push({ at: article.published.publishedAt, editor: null });
        if (Number(new Date(article.published.updatedAt)) > Number(new Date(article.published.publishedAt))) {
            events.push({ at: article.published.updatedAt, editor: null });
        }
    }
    const publicationHistory = events.map((event, index) => ({
        at: event.at, kind: index === 0 ? 'publication' : 'update', number: index,
        editor: event.editor?.name || 'עורך/ת',
        inRange: Number(new Date(event.at)) >= start && Number(new Date(event.at)) <= end,
        comparison: index > 0 ? compareUpdate(event, index, events, minutes, start, end, trackingStart) : null,
    }));
    const visibleEvents = publicationHistory.filter(event => event.inRange);
    return {
        article: { id: String(article._id), title: article.published.title,
            writer: article.writer?.name || 'מערכת', publishedAt: article.published.publishedAt,
            createdAt: article.createdAt || null,
            lastPublishedUpdateAt: Number(new Date(article.published.updatedAt)) > Number(new Date(article.published.publishedAt))
                ? article.published.updatedAt : null,
            totalViews: article.viewCount || 0, trackingStartedAt: article.viewTrackingStartedAt || null,
            isDemo: Boolean(article.analyticsDemo?.key) },
        range, from: new Date(start), to: now, intervalMinutes: interval / MINUTE,
        points, events: visibleEvents, publicationHistory,
        metrics: {
            periodViews: minutes.reduce((sum, row) => sum + row.count, 0),
            updates: visibleEvents.filter(event => event.kind === 'update').length,
            peakViewsPerMinute: Math.max(0, ...minutes.map(row => row.count)),
        },
    };
}

module.exports = { MINUTE, RANGES, floorMinute, rangeWindow, buildAnalytics, compareUpdate };
