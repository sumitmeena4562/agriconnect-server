const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OrderRequest'
    },
    type: {
        type: String,
        enum: ['ORDER_RECEIVED', 'ORDER_ACCEPTED', 'ORDER_REJECTED', 'ORDER_COMPLETED', 'ORDER_CANCELLED', 'SYSTEM'],
        required: true
    },
    text: {
        type: String,
        required: true
    },
    read: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30-day auto-cleanup

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;
