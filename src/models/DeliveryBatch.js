const mongoose = require('mongoose');

const deliveryBatchSchema = new mongoose.Schema({
    // Which farmer created / owns this batch (for filtering)
    farmerOwner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // optional for backward compat with existing batches
    },
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        required: false
    },
    orders: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OrderRequest'
    }],
    totalDistance: {
        type: Number,
        default: 0
    },
    optimizedRoute: [{
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderRequest' },
        stopType: { type: String, enum: ['pickup', 'delivery'] },
        coordinates: {
            lat: { type: Number, required: true },
            lng: { type: Number, required: true }
        },
        address: { type: String },
        sequence: { type: Number, required: true },        // delivery order (1 = first stop to visit)
        loadingSequence: { type: Number, default: null }   // loading order (1 = load first → delivered last)
    }],
    batchStatus: {
        type: String,
        enum: ['Pending', 'Batch Created', 'Driver Assigned', 'Out For Delivery', 'Partially Delivered', 'Completed'],
        default: 'Batch Created'
    }
}, { timestamps: true });

// Indexes for common query patterns
deliveryBatchSchema.index({ farmerOwner: 1, createdAt: -1 });
deliveryBatchSchema.index({ batchStatus: 1, createdAt: -1 });
deliveryBatchSchema.index({ driver: 1, batchStatus: 1 });

module.exports = mongoose.model('DeliveryBatch', deliveryBatchSchema);
