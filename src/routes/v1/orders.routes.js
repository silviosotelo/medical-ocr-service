const express = require('express');
const router = express.Router();
const ordersController = require('../../controllers/v1/orders.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');

router.use(authMiddleware, tenantMiddleware);

router.get('/', ordersController.list);
router.get('/stats', ordersController.getRecentStats);
router.get('/:id', ordersController.getById);

module.exports = router;
