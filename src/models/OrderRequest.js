const mongoose = require('mongoose');

const orderRequestSchema = new mongoose.Schema({
    crop: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Crop',
        required: true
    },
    farmer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    requestedQuantity: {
        type: Number,
        required: true
    },
    offeredPrice: {
        type: Number, // Optional negotiation: Vendor can offer a different price
    },
    message: {
        type: String, // Additional notes from vendor
        default: ''
    },
    pickupDate: {
        type: Date
    },
    vehicleNumber: {
        type: String,
        default: ''
    },
    deliveryNotes: {
        type: String,
        default: ''
    },
    deliveryOTP: {
        type: String
    },
    status: {
        type: String,
        enum: ['Pending', 'Accepted', 'Rejected', 'Completed', 'Cancelled'],
        default: 'Pending'
    },
    // ── Logistics & Delivery Fields ──────────────────────────────────
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        default: null
    },
    dispatchTime: {
        type: Date
    },
    deliveryStatus: {
        type: String,
        enum: ['Pending', 'Assigned', 'In Transit', 'Arrived', 'Completed'],
        default: 'Pending'
    },
    // ── Payment Record (Option B — no gateway required) ──────────────
    payment: {
        amount: {
            type: Number   // auto-calculated: requestedQuantity × offeredPrice
        },
        method: {
            type: String,
            enum: ['UPI', 'Cash', 'Bank Transfer', 'Cheque'],
        },
        upiRef: {
            type: String,  // UPI transaction ID or bank ref (optional)
            default: ''
        },
        status: {
            type: String,
            enum: ['Unpaid', 'Submitted', 'Verified'],
            default: 'Unpaid'
        },
        note: {
            type: String,
            default: ''
        },
        paidAt:     { type: Date },
        verifiedAt: { type: Date }
    }
}, { timestamps: true });

orderRequestSchema.index({ farmer: 1, createdAt: -1 });
orderRequestSchema.index({ vendor: 1, createdAt: -1 });
orderRequestSchema.index({ crop: 1, vendor: 1, status: 1 });

const OrderRequest = mongoose.model('OrderRequest', orderRequestSchema);
module.exports = OrderRequest;
