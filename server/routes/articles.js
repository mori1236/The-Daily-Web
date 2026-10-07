const express = require('express');
const articleController = require('../controllers/articleController');

const router = express.Router();

// Public homepage feed
router.get('/', articleController.showFeed);

// Public JSON API for feed infinite scroll, search and filter
router.get('/api/articles', articleController.getFeedArticles);

// Public full article view
router.get('/articles/:id', articleController.showArticle);

module.exports = router;
