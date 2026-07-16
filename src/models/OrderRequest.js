const mongoose = require('mongoose');
const { encryptOTP, decryptOTP } = require('../utils/otpCrypto');

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
        type: String,
        select: false,  // hidden by default in normal queries
        set: encryptOTP, // encrypts before saving to DB
        get: decryptOTP  // decrypts when reading from DB
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
        enum: ['Pending', 'Batch Created', 'Driver Assigned', 'Out For Delivery', 'Partially Delivered', 'Completed'],
        default: 'Pending'
    },
    deliveryBatchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DeliveryBatch',
        default: null
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
    },
    // ── Route Consolidation (Milk Run) Fields ─────────────────────────
    consolidationStatus: {
        type: String,
        enum: ['standalone', 'primary', 'addon'],
        default: 'standalone'
    },
    consolidatedWith: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OrderRequest'
    }]
}, { 
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
});

orderRequestSchema.index({ farmer: 1, createdAt: -1 });
orderRequestSchema.index({ vendor: 1, createdAt: -1 });
orderRequestSchema.index({ crop: 1, vendor: 1, status: 1 });
orderRequestSchema.index({ deliveryBatchId: 1 }); // for batch delivery queries
orderRequestSchema.index({ deliveryStatus: 1, status: 1 }); // for auto-group filter

const OrderRequest = mongoose.model('OrderRequest', orderRequestSchema);
module.exports = OrderRequest;
