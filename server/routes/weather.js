const express = require('express');
const authController = require('../controllers/weatherController');

const router = express.Router();

router.get('/api/weather', authController.getWeather);

module.exports = router;
