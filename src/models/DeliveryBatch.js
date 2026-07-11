const mongoose = require('mongoose');

const deliveryBatchSchema = new mongoose.Schema({
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

module.exports = mongoose.model('DeliveryBatch', deliveryBatchSchema);
