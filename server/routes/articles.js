const express = require('express');
const { showArticle, addReadingTime } = require('../controllers/articleController');

const router = express.Router();

router.get('/articles/:id', showArticle);
router.post('/api/articles/:id/reading-time', addReadingTime);

module.exports = router;
