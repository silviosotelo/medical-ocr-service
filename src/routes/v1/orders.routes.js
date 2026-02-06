const express = require('express');
const router = express.Router();
const ordersController = require('../../controllers/v1/orders.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');
const { requirePermission } = require('../../middlewares/rbac.middleware');

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission('orders:read'), ordersController.list);
router.get('/stats', requirePermission('orders:read'), ordersController.getRecentStats);
router.get('/:id', requirePermission('orders:read'), ordersController.getById);

module.exports = router;
