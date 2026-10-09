const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const config = require('./server/config'); // טוען ומאמת את משתני הסביבה מקובץ .env
const { loadUser } = require('./server/middleware/auth');
const { csrfProtection } = require('./server/middleware/csrf');
const { contentSecurityPolicy } = require('./server/middleware/csp');
const authRoutes = require('./server/routes/auth');
const writerRoutes = require('./server/routes/writer');
const writerApiRoutes = require('./server/API/writer/routes');
const articleRoutes = require('./server/routes/articles');
const commentRoutes = require('./server/routes/comments');
const editorRoutes = require('./server/routes/editor');
const weatherRoutes = require('./server/routes/weather');
const editorApiRoutes = require('./server/API/editor/routes');
const { seedDemoData } = require('./server/seed');
const { notFound, errorHandler } = require('./server/middleware/errorHandler');

const app = express();
const PORT = config.port;

// הגדרת EJS כמנוע התבניות (View Engine)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(contentSecurityPolicy); // מגביל מאיפה הדפדפן רשאי להריץ סקריפטים (הגנה נוספת מפני XSS)
app.use(express.static(path.join(__dirname, 'public')));

// קריאת גוף הבקשה מטפסים (POST) ומ-JSON (Ajax)
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// דוחה בקשות שמשנות נתונים ומגיעות מאתר אחר (CSRF)
app.use(csrfProtection);

// זיהוי המשתמש המחובר לפי עוגיית ה-session (req.user)
app.use(loadUser);

// הגדרת תיקייה לקבצים סטטיים (כמו CSS, תמונות וכו')

// חיבור למסד הנתונים MongoDB (תוודא שקובץ ה-.env שלך מוגדר עם MONGO_URI)
mongoose.connect(config.mongoUri)
    .then(async () => {
        console.log('Connected to MongoDB successfully!');
        // מילוי נתוני דמו כשהדגל SEED_DEMO_DATA=true מוגדר ב-.env
        if (config.seedDemoData) await seedDemoData();
    })
    .catch(err => console.error('MongoDB connection error:', err));

// פיד הכתבות הראשי ודפי הכתבות
app.use(articleRoutes);
app.use(commentRoutes);

// התחברות / התנתקות
app.use(authRoutes);

// אזור הכתב — ניהול הכתבות האישיות
app.use(writerRoutes);
app.use('/api/writer', writerApiRoutes); // JSON: the article list and stats for the writer page

// אזור העורך — תור האישורים וניהול כל הכתבות
app.use(editorRoutes);
app.use('/api/editor', editorApiRoutes); // JSON: the article list and the review panel for the editor page

// בקשות מזג אוויר
app.use(weatherRoutes);
app.use(notFound);
app.use(errorHandler);
// הפעלת השרת האזנה לפורט
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
