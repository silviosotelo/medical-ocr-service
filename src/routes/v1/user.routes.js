const express = require('express');
const router = express.Router();
const userController = require('../../controllers/v1/user.controller');
const { authMiddleware, requireRole } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');

router.use(authMiddleware, tenantMiddleware);

router.get('/', requireRole('admin', 'super_admin'), userController.list);
router.post('/', requireRole('admin', 'super_admin'), userController.create);
router.get('/:id', userController.getById);
router.put('/:id', requireRole('admin', 'super_admin'), userController.update);
router.delete('/:id', requireRole('admin', 'super_admin'), userController.remove);

module.exports = router;
