const express = require('express');
const weatherController = require('../controllers/weatherController');

const router = express.Router();
// פניות לקבלת מזג אוויר
router.get('/api/weather', weatherController.getWeather);

module.exports = router;
