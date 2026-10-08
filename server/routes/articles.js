const express = require('express');
const { showArticle } = require('../controllers/articleController');

const router = express.Router();

router.get('/articles/:id', showArticle);

module.exports = router;
