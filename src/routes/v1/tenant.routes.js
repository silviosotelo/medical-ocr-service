const express = require('express');
const router = express.Router();
const tenantController = require('../../controllers/v1/tenant.controller');
const { authMiddleware, requireRole } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');

router.use(authMiddleware);

router.get('/', requireRole('super_admin'), tenantController.list);
router.post('/', requireRole('super_admin'), tenantController.create);
router.get('/stats', tenantMiddleware, tenantController.getStats);
router.get('/dashboard', tenantMiddleware, tenantController.getDashboard);
router.get('/:id', requireRole('super_admin', 'admin'), tenantController.getById);
router.put('/:id', requireRole('super_admin'), tenantController.update);

module.exports = router;
