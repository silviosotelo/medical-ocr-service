const express = require('express');
const router = express.Router();
const apikeyController = require('../../controllers/v1/apikey.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');
const { requirePermission } = require('../../middlewares/rbac.middleware');

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission('api_keys:read'), apikeyController.list);
router.post('/', requirePermission('api_keys:write'), apikeyController.create);
router.delete('/:id', requirePermission('api_keys:delete'), apikeyController.revoke);

module.exports = router;
