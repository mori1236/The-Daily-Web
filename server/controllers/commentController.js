const Comment = require('../models/comment');
const Article = require('../models/article');
const { formatRelativeTime } = require('../utils/format');

/**
 * מחלץ ראשי תיבות של שם (למשל: "אורי כהן" -> "אכ", "מאיה לב" -> "מל")
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2);
    return (parts[0][0] + parts[parts.length - 1][0]);
}

/**
 * ממיר תגובה למבנה לתצוגה עם ראשי תיבות וזמן יחסי
 * @param {any} commentDoc
 * @param {Date} [now]
 */
function formatComment(commentDoc, now = new Date()) {
    const doc = commentDoc.toObject ? commentDoc.toObject() : commentDoc;
    return {
        id: String(doc._id),
        articleId: String(doc.article),
        authorName: doc.authorName,
        content: doc.content,
        initials: getInitials(doc.authorName),
        createdAt: doc.createdAt,
        createdAtIso: new Date(doc.createdAt).toISOString(),
        relativeTime: formatRelativeTime(doc.createdAt, now),
        isUser: !!doc.user,
    };
}

const commentController = {
    /**
     * POST /api/articles/:articleId/comments
     * יצירת תגובה חדשה לכתבה.
     */
    async create(req, res) {
        try {
            const { articleId } = req.params;
            if (!articleId || !articleId.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).json({ error: 'מזהה כתבה לא תקין' });
            }

            // בדיקה שהכתבה קיימת ומאושרת לפרסום
            const article = await Article.findOne({ _id: articleId, published: { $ne: null } });
            if (!article) {
                return res.status(404).json({ error: 'הכתבה לא נמצאה או שאינה מפורסמת' });
            }

            const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
            if (!content) {
                return res.status(400).json({ error: 'תוכן התגובה אינו יכול להיות ריק' });
            }
            if (content.length > 1000) {
                return res.status(400).json({ error: 'התגובה ארוכה מדי (עד 1,000 תווים)' });
            }

            let authorName = '';
            let userId = null;

            if (req.user) {
                authorName = req.user.name;
                userId = req.user._id;
            } else {
                authorName = typeof req.body.authorName === 'string' ? req.body.authorName.trim() : '';
                if (!authorName) {
                    authorName = 'קורא/ת באתר';
                }
                if (authorName.length > 60) {
                    authorName = authorName.slice(0, 60);
                }
            }

            const comment = await Comment.create({
                article: articleId,
                user: userId,
                authorName,
                content,
            });

            const formatted = formatComment(comment);
            res.status(201).json({
                success: true,
                comment: formatted,
            });
        } catch (err) {
            console.error('Error creating comment:', err);
            res.status(500).json({ error: 'אירעה שגיאה בשמירת התגובה' });
        }
    },

    /**
     * GET /api/articles/:articleId/comments
     * שליפת תגובות לכתבה ב-JSON (למקרה של טעינה אסינכרונית).
     */
    async list(req, res) {
        try {
            const { articleId } = req.params;
            if (!articleId || !articleId.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).json({ error: 'מזהה כתבה לא תקין' });
            }

            const comments = await Comment.find({ article: articleId }).sort({ createdAt: -1 });
            const now = new Date();
            res.json({
                comments: comments.map(c => formatComment(c, now)),
                count: comments.length,
            });
        } catch (err) {
            console.error('Error fetching comments:', err);
            res.status(500).json({ error: 'אירעה שגיאה בטעינת התגובות' });
        }
    },

    /**
     * DELETE /api/comments/:id
     * מחיקת תגובה (רק על ידי עורך או כותב התגובה המקורי).
     */
    async delete(req, res) {
        try {
            const { id } = req.params;
            if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).json({ error: 'מזהה תגובה לא תקין' });
            }

            const comment = await Comment.findById(id);
            if (!comment) {
                return res.status(404).json({ error: 'התגובה לא נמצאה' });
            }

            // בדיקת הרשאות: רק עורך או המשתמש שכתב אותה
            const isEditor = req.user && req.user.role === 'editor';
            const isAuthor = req.user && comment.user && comment.user.equals(req.user._id);

            if (!isEditor && !isAuthor) {
                return res.status(403).json({ error: 'אין לך הרשאה למחוק תגובה זו' });
            }

            await Comment.findByIdAndDelete(id);
            res.json({ success: true });
        } catch (err) {
            console.error('Error deleting comment:', err);
            res.status(500).json({ error: 'אירעה שגיאה במחיקת התגובה' });
        }
    },

    /**
     * PUT /api/comments/:id
     * עדכון תגובה (רק על ידי כותב התגובה או עורך).
     */
    async update(req, res) {
        try {
            const { id } = req.params;
            const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
            if (!content) {
                return res.status(400).json({ error: 'תוכן התגובה אינו יכול להיות ריק' });
            }

            const comment = await Comment.findById(id);
            if (!comment) {
                return res.status(404).json({ error: 'התגובה לא נמצאה' });
            }

            const isEditor = req.user && req.user.role === 'editor';
            const isAuthor = req.user && comment.user && comment.user.equals(req.user._id);

            if (!isEditor && !isAuthor) {
                return res.status(403).json({ error: 'אין לך הרשאה לערוך תגובה זו' });
            }

            comment.content = content;
            await comment.save();

            res.json({ success: true, comment: formatComment(comment) });
        } catch (err) {
            console.error('Error updating comment:', err);
            res.status(500).json({ error: 'אירעה שגיאה בעדכון התגובה' });
        }
    },
};

module.exports = { commentController, formatComment, getInitials };

