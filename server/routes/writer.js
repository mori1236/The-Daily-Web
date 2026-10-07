const express = require('express');
const { requireRoleHandler } = require('../middleware/auth');
const writerController = require('../controllers/writerController');

const router = express.Router();

router.get('/writer', requireRoleHandler('writer'), writerController.showDashboard);

module.exports = router;
