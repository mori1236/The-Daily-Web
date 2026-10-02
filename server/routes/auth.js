const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.get('/login', authController.showLogin);
router.post('/login', authController.login);
router.get('/login/error', authController.showLoginError);
router.get('/register', authController.showRegister);
router.post('/register', authController.register);
router.get('/register/error', authController.showRegisterError);
router.post('/logout', authController.logout);

module.exports = router;
