const express = require('express');
const router = express.Router();
const webhookController = require('../../controllers/v1/webhook.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');
const { requirePermission } = require('../../middlewares/rbac.middleware');

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission('webhooks:read'), webhookController.list);
router.post('/', requirePermission('webhooks:write'), webhookController.create);
router.put('/:id', requirePermission('webhooks:write'), webhookController.update);
router.delete('/:id', requirePermission('webhooks:delete'), webhookController.remove);

module.exports = router;
