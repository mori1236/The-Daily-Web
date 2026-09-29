const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
//require('dotenv').config(); // טעינת משתני סביבה מקובץ .env

const app = express();
const PORT = process.env.PORT || 3000;

// הגדרת EJS כמנוע התבניות (View Engine)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// הגדרת תיקייה לקבצים סטטיים (כמו CSS, תמונות וכו')

// חיבור למסד הנתונים MongoDB (תוודא שקובץ ה-.env שלך מוגדר עם MONGO_URI)
// mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/the-daily-web')
//     .then(() => console.log('Connected to MongoDB successfully!'))
//     .catch(err => console.error('MongoDB connection error:', err));

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

// הפעלת השרת האזנה לפורט
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});