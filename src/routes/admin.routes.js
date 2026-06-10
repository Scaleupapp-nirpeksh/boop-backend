const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { adminAuth } = require('../middleware/adminAuth');

// All admin routes require the x-admin-key header
router.use(adminAuth);

router.get('/reports', adminController.getReports);
router.patch('/reports/:id', adminController.resolveReport);
router.get('/moderation-flags', adminController.getModerationFlags);
router.patch('/moderation-flags/:id', adminController.resolveModerationFlag);
router.post('/users/:id/ban', adminController.banUser);
router.post('/users/:id/unban', adminController.unbanUser);

module.exports = router;
