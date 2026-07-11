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
    emergencyContactName: {
        type: String,
        trim: true
    },
    emergencyContactPhone: {
        type: String,
        trim: true
    },
    aadhaarNumber: {
        type: String,
        trim: true
    },
    licenseClass: {
        type: String,
        trim: true
    },
    licenseExpiry: {
        type: Date
    },
    rcExpiry: {
        type: Date
    },
    vehicleModel: {
        type: String,
        trim: true
    },
    fuelType: {
        type: String,
        enum: ['Diesel', 'CNG', 'Electric', 'Petrol'],
        default: 'Diesel'
    },
    insurancePolicyNumber: {
        type: String,
        trim: true
    },
    insuranceExpiry: {
        type: Date
    },
    panNumber: {
        type: String,
        trim: true,
        uppercase: true
    },
    bankAccountName: {
        type: String,
        trim: true
    },
    bankAccountNumber: {
        type: String,
        trim: true
    },
    bankAccountIfsc: {
        type: String,
        trim: true,
        uppercase: true
    },
    upiId: {
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
