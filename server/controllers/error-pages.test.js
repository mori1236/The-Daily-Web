const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const express = require('express');
const ejs = require('ejs');
const Article = require('../models/article');
const articleController = require('./articleController');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const views = path.join(__dirname, '../../views');

test('auth error template works without optional render locals', async () => {
    const html = await ejs.renderFile(path.join(views, 'auth-error.ejs'), { message: 'אירעה שגיאה' });
    assert.match(html, /href="\/" class="btn/);
    assert.match(html, /חזרה לדף הבית/);
    const retry = await ejs.renderFile(path.join(views, 'auth-error.ejs'), {
        message: 'אירעה שגיאה', retryUrl: '/login', retryLabel: 'נסו שוב',
    });
    assert.match(retry, /href="\/login"/);
    assert.match(retry, /נסו שוב/);
});

test('missing pages and article IDs return 404; unexpected errors never expose details', async t => {
    t.mock.method(console, 'error', () => {});
    let queryCount = 0;
    t.mock.method(Article, 'findOne', () => {
        queryCount++;
        return { populate: async () => null };
    });
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', views);
    app.use(express.json());
    app.get('/articles/:id', articleController.showArticle);
    app.get('/failure', async () => { throw new Error('PRIVATE_DATABASE_PASSWORD'); });
    app.get('/api/failure', async () => { throw new Error('PRIVATE_DATABASE_PASSWORD'); });
    app.get('/auth-error', (req, res) => res.status(500).render('auth-error', { message: 'אירעה שגיאה' }));
    app.use(notFound);
    app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}`;

    for (const url of ['/articles/bad-id', '/articles/000000000000000000000001', '/missing-page']) {
        const response = await fetch(base + url);
        const html = await response.text();
        assert.equal(response.status, 404);
        assert.match(html, /הדף לא נמצא/);
        assert.match(html, /href="\/"/);
        assert.doesNotMatch(html, /ReferenceError|retryUrl|node_modules|Error:/);
    }
    assert.equal(queryCount, 1); // Invalid IDs never reach the database.
    const failure = await fetch(base + '/failure');
    assert.equal(failure.status, 500);
    const failureHtml = await failure.text();
    assert.match(failureHtml, /משהו השתבש/);
    assert.doesNotMatch(failureHtml, /PRIVATE_DATABASE_PASSWORD|node_modules/);

    for (const [url, status] of [['/api/missing', 404], ['/api/failure', 500]]) {
        const response = await fetch(base + url);
        assert.equal(response.status, status);
        assert.match(response.headers.get('content-type'), /application\/json/);
        assert.doesNotMatch(JSON.stringify(await response.json()), /PRIVATE_DATABASE_PASSWORD|Error:/);
    }
    const badJson = await fetch(base + '/api/anything', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad',
    });
    assert.equal(badJson.status, 400);
    assert.doesNotMatch(JSON.stringify(await badJson.json()), /SyntaxError|stack/);
    const authError = await fetch(base + '/auth-error');
    assert.equal(authError.status, 500);
    assert.doesNotMatch(await authError.text(), /retryUrl is not defined/);
});

test('error handler stays safe even when the error page itself fails to render', () => {
    const originalLog = console.error;
    console.error = () => {};
    try {
        let body;
        const res = {
            status(code) { assert.equal(code, 404); return this; },
            render(view, locals, callback) { callback(new Error('PRIVATE_TEMPLATE_PATH')); },
            type(value) { assert.equal(value, 'text'); return this; },
            send(value) { body = value; },
        };
        notFound({ path: '/missing' }, res);
        assert.match(body, /404/);
        assert.doesNotMatch(body, /PRIVATE_TEMPLATE_PATH/);
    } finally {
        console.error = originalLog;
    }
});
