const express = require('express');
const { commentController } = require('../controllers/commentController');
const { commentLimiter } = require('../middleware/commentLimiter');

const router = express.Router();

// יצירת תגובה חדשה (מוגן ע"י מגבלת 3 תגובות לדקה לאורחים)
router.post('/api/articles/:articleId/comments', commentLimiter, commentController.create);

// שליפת תגובות לכתבה
router.get('/api/articles/:articleId/comments', commentController.list);

// מחיקת תגובה (לעורכים או לכותב)
router.delete('/api/comments/:id', commentController.delete);

// עריכת תגובה (לעורכים או לכותב)
router.put('/api/comments/:id', commentController.update);

module.exports = router;

