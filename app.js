const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const config = require('./server/config'); // טוען ומאמת את משתני הסביבה מקובץ .env
const { loadUser } = require('./server/middleware/auth');
const authRoutes = require('./server/routes/auth');

const app = express();
const PORT = config.port;

// הגדרת EJS כמנוע התבניות (View Engine)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// קריאת גוף הבקשה מטפסים (POST) ומ-JSON (Ajax)
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// זיהוי המשתמש המחובר לפי עוגיית ה-session (req.user)
app.use(loadUser);

// הגדרת תיקייה לקבצים סטטיים (כמו CSS, תמונות וכו')

// חיבור למסד הנתונים MongoDB (תוודא שקובץ ה-.env שלך מוגדר עם MONGO_URI)
mongoose.connect(config.mongoUri)
    .then(() => console.log('Connected to MongoDB successfully!'))
    .catch(err => console.error('MongoDB connection error:', err));

// נתיב לדף הבית (הפיד)
app.get('/', async (req, res) => {
    try {
        // כרגע נשלח מערך ריק, בהמשך נשלח לכאן את הכתבות מ-MongoDB
        const articles = []; 
        res.render('index', { articles });
    } catch (err) {
        console.error(err);
        res.status(500).send('שגיאת שרת פנימית');
    }
});

// התחברות / התנתקות
app.use(authRoutes);

// הפעלת השרת האזנה לפורט
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});