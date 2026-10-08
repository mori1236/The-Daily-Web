const express = require('express');
const { requireRoleHandler } = require('../middleware/auth');
const editorController = require('../controllers/editorController');

const router = express.Router();
const requireEditor = requireRoleHandler('editor');

// Pages
router.get('/editor', requireEditor, editorController.showQueue);
router.get('/editor/articles/:id/edit', requireEditor, editorController.showEditor);

// JSON API for the actions on an article (Ajax). The lists are in server/API/editor.
router.patch('/api/editor/articles/:id', requireEditor, editorController.saveArticle);
router.post('/api/editor/articles/:id/publish', requireEditor, editorController.publishArticle);
router.post('/api/editor/articles/:id/return', requireEditor, editorController.returnArticle);
router.delete('/api/editor/articles/:id', requireEditor, editorController.deleteArticle);

module.exports = router;
