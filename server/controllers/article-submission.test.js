const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const Article = require('../models/article');

test('submission and resubmission reject empty HTML without saving or changing state', async () => {
    const writer = { _id: new mongoose.Types.ObjectId(), role: 'writer' };
    for (const state of ['draft', 'returned']) {
        for (const content of ['', '<br>', '<p><br></p>', '<p>&nbsp; &#160; &#x200B;</p>', '<div><strong> </strong></div>']) {
            const article = new Article({ writer: writer._id, state, title: 'Title', summary: 'Summary', category: 'tech', content });
            article.save = async () => assert.fail('Empty article must not be saved');
            const submit = state === 'draft' ? 'SubmitDraftNow' : 'SubmitRejectFixNow';
            await assert.rejects(article[submit](writer), /missing content/);
            assert.equal(article.state, state);
        }
    }
    const article = new Article({ writer: writer._id, title: 'Title', summary: 'Summary', category: 'tech', content: '<p>תוכן כתבה</p>' });
    let saved = false;
    article.save = async () => { saved = true; };
    await article.SubmitDraftNow(writer);
    assert.equal(article.state, 'pending');
    assert.equal(saved, true);
});
