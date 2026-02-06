const express = require('express');
const router = express.Router();
const webhookController = require('../../controllers/v1/webhook.controller');
const { authMiddleware, requireRole } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');

router.use(authMiddleware, tenantMiddleware);

router.get('/', webhookController.list);
router.post('/', requireRole('admin', 'super_admin'), webhookController.create);
router.put('/:id', requireRole('admin', 'super_admin'), webhookController.update);
router.delete('/:id', requireRole('admin', 'super_admin'), webhookController.remove);

module.exports = router;
