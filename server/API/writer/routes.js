// JSON API for the writer's article list. Mounted at /api/writer in app.js.
// The page script (public/js/writer.js) calls these routes after the first server render.

const express = require('express');
const { requireRoleHandler } = require('../../middleware/auth');
const { toArticleRow } = require('../../utils/articles.utils');
const query = require('./query');

const router = express.Router();

// Every route here is for logged-in writers only (checked on the server).
// Requests under /api/ get a JSON error (401 / 403) instead of a redirect.
router.use(requireRoleHandler('writer'));

// GET /api/writer/stats — counts for the summary cards and the filter chips.
router.get('/stats', async (req, res) => {
    try {
        res.json(await query.getStats(req.user._id, new Date()));
    } catch (err) {
        console.error('API error (GET /api/writer/stats):', err);
        res.status(500).json({ error: 'אירעה שגיאה בשרת' });
    }
});

// GET /api/writer/articles?status=draft&q=title&page=2 — one page of the writer's own articles.
// Returns the filters that were really used (bad values are ignored), the paging info,
// and `rows`, which are ready to show in the table (Hebrew labels, formatted dates).
router.get('/articles', async (req, res) => {
    try {
        const listQuery = query.parseListQuery(req.query);
        const result = await query.listArticles(req.user._id, listQuery);
        const now = new Date();
        res.json({
            status: listQuery.status,
            q: listQuery.q,
            page: result.page,
            pages: result.pages,
            total: result.total,
            rows: result.articles.map(article => toArticleRow(article, now)),
        });
    } catch (err) {
        console.error('API error (GET /api/writer/articles):', err);
        res.status(500).json({ error: 'אירעה שגיאה בשרת' });
    }
});

module.exports = router;
