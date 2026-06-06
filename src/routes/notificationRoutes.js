const express = require('express');
const router = express.Router();
const { getNotifications, markAllRead, markRead, deleteReadNotifications, getUnreadCount } = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

// All notification routes require user authentication
router.use(protect);

router.route('/')
    .get(getNotifications);

router.get('/unread-count', getUnreadCount);
router.patch('/mark-read', markAllRead);
router.delete('/read', deleteReadNotifications);
router.patch('/:id/read', markRead);

module.exports = router;
