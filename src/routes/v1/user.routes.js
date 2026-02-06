const express = require('express');
const router = express.Router();
const userController = require('../../controllers/v1/user.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');
const { isAdminOrAbove } = require('../../middlewares/rbac.middleware');

router.use(authMiddleware, tenantMiddleware);

router.get('/', isAdminOrAbove, userController.list);
router.post('/', isAdminOrAbove, userController.create);
router.get('/:id', isAdminOrAbove, userController.getById);
router.put('/:id', isAdminOrAbove, userController.update);
router.delete('/:id', isAdminOrAbove, userController.remove);

module.exports = router;
