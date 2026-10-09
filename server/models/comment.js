const mongoose = require('mongoose');

// מודל תגובה לכתבה (Comment)
const commentSchema = new mongoose.Schema({
    // הכתבה אליה שייכת התגובה
    article: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Article',
        required: true,
        index: true,
    },
    // המשתמש שיצר את התגובה (אם מחובר; null אם אורח)
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    // שם כותב התגובה
    authorName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60,
    },
    // תוכן התגובה
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000,
    },
}, { timestamps: true });

// אינדקס לשליפת תגובות לפי כתבה, מסודרות מהחדשה לישנה
commentSchema.index({ article: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
