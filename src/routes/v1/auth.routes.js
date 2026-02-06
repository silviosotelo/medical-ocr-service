const express = require('express');
const router = express.Router();
const authController = require('../../controllers/v1/auth.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.get('/me', authMiddleware, authController.me);
router.get('/permissions', authMiddleware, authController.permissions);
router.put('/password', authMiddleware, authController.changePassword);

module.exports = router;
