// מגבלת תגובות לאורחים: עד 3 תגובות לדקה מאותו מכשיר
const WINDOW_MS = 60 * 1000; // דקה אחת במילישניות
const MAX_COMMENTS_PER_WINDOW = 3;

// מפה ששומרת עבור כל מכשיר/IP מערך של חותמות זמן (timestamps) של תגובות אחרונות
const guestSubmissions = new Map();

// ניקוי תקופתי של רשומות ישנות כדי למנוע דליפת זיכרון
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of guestSubmissions.entries()) {
        const active = timestamps.filter(t => now - t < WINDOW_MS);
        if (active.length === 0) {
            guestSubmissions.delete(key);
        } else {
            guestSubmissions.set(key, active);
        }
    }
}, WINDOW_MS).unref();

/**
 * Middleware המגביל אורחים לעד 3 תגובות בדקה.
 */
function commentLimiter(req, res, next) {
    // משתמשים מחוברים (כתב / עורך) אינם אורחים
    if (req.user) {
        return next();
    }

    // זיהוי מכשיר האורח לפי כתובת IP ומזהה מכשיר אופציונלי בכותרת
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const deviceId = req.headers['x-device-id'] || '';
    const clientKey = `${ip}_${deviceId}`;

    const now = Date.now();
    const timestamps = guestSubmissions.get(clientKey) || [];

    // סינון חותמות זמן מהדקה האחרונה בלבד
    const recent = timestamps.filter(t => now - t < WINDOW_MS);

    if (recent.length >= MAX_COMMENTS_PER_WINDOW) {
        return res.status(429).json({
            error: 'חרגת ממגבלת התגובות: ניתן לפרסם עד 3 תגובות בדקה מאותו מכשיר. אנא המתן מעט ונסה שוב.',
        });
    }

    // הוספת הבקשה הנוכחית לרשימה
    recent.push(now);
    guestSubmissions.set(clientKey, recent);

    next();
}

module.exports = { commentLimiter, guestSubmissions };
