const express = require('express');
const { requireRoleHandler } = require('../middleware/auth');
const writerController = require('../controllers/writerController');

const router = express.Router();
const requireWriter = requireRoleHandler('writer');

// Pages
router.get('/writer', requireWriter, writerController.showDashboard);
router.post('/writer/articles', requireWriter, writerController.createArticle);
router.get('/writer/articles/:id/edit', requireWriter, writerController.showEditor);

// JSON API used by the editor (Ajax)
router.patch('/api/writer/articles/:id', requireWriter, writerController.saveArticle);
router.post('/api/writer/articles/:id/submit', requireWriter, writerController.submitArticle);

module.exports = router;
