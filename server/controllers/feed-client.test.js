const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('changing read filters aborts old requests and ignores stale responses', async () => {
    const listeners = {};
    const requests = [];
    const elements = {};
    for (const id of ['articlesGrid', 'emptyState', 'feedLoader', 'loadMoreBtn',
        'allLoadedNotice', 'readStatusSelect', 'heroArticleCard', 'heroTitle']) {
        elements[id] = {
            style: {}, dataset: {}, children: [], innerHTML: '',
            addEventListener(event, callback) { listeners[`${id}:${event}`] = callback; },
            querySelector() { return null; },
        };
    }
    const document = {
        addEventListener(event, callback) { listeners[event] = callback; },
        getElementById(id) { return elements[id] || null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
    };
    const location = { search: '?readStatus=unread', href: 'http://localhost/?readStatus=unread' };
    const id = '000000000000000000000001';
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/js/feed.js'), 'utf8'), {
        document,
        window: { location, history: { pushState() {} }, addEventListener() {} },
        localStorage: { getItem: () => JSON.stringify([id, 'bad-id']) },
        URL, URLSearchParams, AbortController, console, setTimeout, clearTimeout,
        fetch(url, options) {
            return new Promise(resolve => requests.push({ url, options, resolve }));
        },
    });
    listeners.DOMContentLoaded();
    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(requests[0].options.body), { readStatus: 'unread', readIds: [id] });
    listeners['readStatusSelect:change']({ target: { value: 'read' } });
    assert.equal(requests.length, 2);
    assert.equal(requests[0].options.signal.aborted, true);
    assert.equal(new URL(requests[1].url, location.href).searchParams.get('page'), '1');
    assert.equal(JSON.parse(requests[1].options.body).readStatus, 'read');
    const response = title => ({ ok: true, json: async () => ({
        articles: [], hasMore: false, heroArticle: { id, title },
    }) });
    requests[0].resolve(response('stale'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(elements.feedLoader.style.display, 'flex');
    assert.equal(elements.heroTitle.textContent, undefined);
    requests[1].resolve(response('current'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(elements.heroTitle.textContent, 'current');
    assert.equal(elements.feedLoader.style.display, 'none');
    assert.equal(elements.loadMoreBtn.style.display, 'none');
    assert.equal(requests.length, 2); // No recursive background requests.
});
