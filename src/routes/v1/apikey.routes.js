const express = require('express');
const router = express.Router();
const apikeyController = require('../../controllers/v1/apikey.controller');
const { authMiddleware, requireRole } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');

router.use(authMiddleware, tenantMiddleware);

router.get('/', apikeyController.list);
router.post('/', requireRole('admin', 'super_admin'), apikeyController.create);
router.delete('/:id', requireRole('admin', 'super_admin'), apikeyController.revoke);

module.exports = router;
