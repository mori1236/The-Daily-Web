const express = require('express');
const authController = require('../controllers/weatherController');

const router = express.Router();
// פניות לקבלת מזג אוויר
router.get('/api/weather', authController.getWeather);

module.exports = router;
