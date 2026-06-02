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
    }
}, { timestamps: true });

const OrderRequest = mongoose.model('OrderRequest', orderRequestSchema);
module.exports = OrderRequest;
