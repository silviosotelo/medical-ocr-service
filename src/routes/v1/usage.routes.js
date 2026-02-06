const express = require('express');
const router = express.Router();
const usageController = require('../../controllers/v1/usage.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');

router.use(authMiddleware, tenantMiddleware);

router.get('/', usageController.getLogs);
router.get('/summary', usageController.getSummary);
router.get('/daily', usageController.getDaily);
router.get('/quota', usageController.getQuota);

module.exports = router;
