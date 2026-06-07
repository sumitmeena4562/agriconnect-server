const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
    farmer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    vehicleNumber: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    vehicleType: {
        type: String,
        enum: ['Bike', 'Tractor', 'Mini Truck', 'Large Truck'],
        required: true
    },
    payloadCapacity: {
        type: Number,
        required: true,
        min: 1
    },
    licenseNumber: {
        type: String,
        trim: true
    },
    rcNumber: {
        type: String,
        trim: true,
        uppercase: true
    },
    address: {
        type: String,
        trim: true
    },
    insuranceDoc: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ['Available', 'On Delivery', 'Offline'],
        default: 'Available'
    },
    // Default coordinate coordinates (can be updated dynamically or simulated)
    latitude: {
        type: Number,
        default: 28.6139 // Default near Delhi/NCR
    },
    longitude: {
        type: Number,
        default: 77.2090
    }
}, { timestamps: true });

driverSchema.index({ farmer: 1, status: 1 });

const Driver = mongoose.model('Driver', driverSchema);
module.exports = Driver;
