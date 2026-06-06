const Notification = require('../models/Notification');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get all notifications for logged in user
// @route   GET /api/notifications
// @access  Private
const getNotifications = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ recipient: req.user.id })
        .populate({
            path: 'order',
            select: 'requestedQuantity offeredPrice status deliveryOTP crop',
            populate: {
                path: 'crop',
                select: 'name unit images'
            }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const total = await Notification.countDocuments({ recipient: req.user.id });

    res.status(200).json({
        success: true,
        data: notifications,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    });
});

// @desc    Mark all notifications as read
// @route   PATCH /api/notifications/mark-read
// @access  Private
const markAllRead = asyncHandler(async (req, res) => {
    await Notification.updateMany(
        { recipient: req.user.id, read: false },
        { read: true }
    );

    res.status(200).json({
        success: true,
        message: 'All notifications marked as read'
    });
});

// @desc    Mark a single notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
const markRead = asyncHandler(async (req, res) => {
    const notification = await Notification.findOne({
        _id: req.params.id,
        recipient: req.user.id
    });

    if (!notification) {
        throw new ErrorResponse('Notification not found', 404);
    }

    notification.read = true;
    await notification.save();

    res.status(200).json({
        success: true,
        data: notification
    });
});

// Helper function to create notifications dynamically on transaction hooks
const createNotification = async (recipient, sender, order, type, text) => {
    try {
        const notification = await Notification.create({
            recipient,
            sender,
            order,
            type,
            text
        });
        return { success: true, notification };
    } catch (error) {
        console.error('[NOTIFICATION_FAILED] Error creating notification:', error.message, { recipient, type });
        return { success: false, error: error.message };
    }
};

// @desc    Delete all read notifications for logged in user
// @route   DELETE /api/notifications/read
// @access  Private
const deleteReadNotifications = asyncHandler(async (req, res) => {
    const result = await Notification.deleteMany({
        recipient: req.user.id,
        read: true
    });

    res.status(200).json({
        success: true,
        message: 'Read notifications cleared',
        deletedCount: result.deletedCount
    });
});

// @desc    Get unread notifications count
// @route   GET /api/notifications/unread-count
// @access  Private
const getUnreadCount = asyncHandler(async (req, res) => {
    const count = await Notification.countDocuments({ recipient: req.user.id, read: false });
    res.status(200).json({
        success: true,
        count
    });
});

module.exports = {
    getNotifications,
    markAllRead,
    markRead,
    createNotification,
    deleteReadNotifications,
    getUnreadCount
};
