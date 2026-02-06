const express = require('express');
const router = express.Router();
const tenantController = require('../../controllers/v1/tenant.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');
const { isSuperAdmin } = require('../../middlewares/rbac.middleware');

router.use(authMiddleware);

router.get('/', isSuperAdmin, tenantController.list);
router.post('/', isSuperAdmin, tenantController.create);
router.get('/stats', tenantMiddleware, tenantController.getStats);
router.get('/dashboard', tenantMiddleware, tenantController.getDashboard);
router.get('/:id', isSuperAdmin, tenantController.getById);
router.put('/:id', isSuperAdmin, tenantController.update);

module.exports = router;
