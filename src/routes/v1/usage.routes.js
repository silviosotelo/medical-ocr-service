const express = require('express');
const router = express.Router();
const usageController = require('../../controllers/v1/usage.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');
const { requirePermission } = require('../../middlewares/rbac.middleware');

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission('usage:read'), usageController.getLogs);
router.get('/summary', requirePermission('usage:read'), usageController.getSummary);
router.get('/daily', requirePermission('usage:read'), usageController.getDaily);
router.get('/quota', requirePermission('usage:read'), usageController.getQuota);

module.exports = router;
