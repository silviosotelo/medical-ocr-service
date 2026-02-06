const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const dataController = require('../../controllers/v1/data-import.controller');
const { authMiddleware, requireRole } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');

const upload = multer({
  dest: path.join(process.env.TEMP_DIR || './temp', 'imports'),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel/CSV files allowed'));
    }
  },
});

router.use(authMiddleware, tenantMiddleware);

router.post('/import', requireRole('admin', 'super_admin'), upload.single('file'), dataController.importFile);
router.post('/embeddings', requireRole('admin', 'super_admin'), dataController.generateEmbeddings);
router.get('/export/:type', dataController.exportData);
router.get('/stats', dataController.getStats);

module.exports = router;
