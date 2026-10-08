// JSON API for the editor's article list and review panel. Mounted at /api/editor in app.js.
// The page script (public/js/editor.js) calls these routes after the first server render.
// The actions that change an article (edit, approve, return, delete) are in server/routes/editor.js.

const express = require('express');
const { requireRoleHandler } = require('../../middleware/auth');
const { toQueueRow, toReview } = require('../../utils/articles.utils');
const query = require('./query');

const router = express.Router();

// Every route here is for logged-in editors only (checked on the server).
// Requests under /api/ get a JSON error (401 / 403) instead of a redirect.
router.use(requireRoleHandler('editor'));

// GET /api/editor/articles?status=pending&q=title&page=2 — one page of articles from all writers.
// Returns the filters that were really used (bad values are ignored), the paging info,
// `counts` for the filter chips, and `rows`, which are ready to show in the list.
router.get('/articles', async (req, res) => {
    try {
        const listQuery = query.parseListQuery(req.query);
        const [result, counts] = await Promise.all([query.listArticles(listQuery), query.getCounts()]);
        const now = new Date();
        res.json({
            status: listQuery.status,
            q: listQuery.q,
            page: result.page,
            pages: result.pages,
            total: result.total,
            counts,
            rows: result.articles.map(article => toQueueRow(article, now)),
        });
    } catch (err) {
        console.error('API error (GET /api/editor/articles):', err);
        res.status(500).json({ error: 'אירעה שגיאה בשרת' });
    }
});

// GET /api/editor/articles/:id — what the review panel shows: the published and the new version.
router.get('/articles/:id', async (req, res) => {
    try {
        const article = await query.findArticle(req.params.id);
        if (!article) return res.status(404).json({ error: 'הכתבה לא נמצאה' });
        res.json({ review: toReview(article, new Date()) });
    } catch (err) {
        console.error('API error (GET /api/editor/articles/:id):', err);
        res.status(500).json({ error: 'אירעה שגיאה בשרת' });
    }
});

module.exports = router;
