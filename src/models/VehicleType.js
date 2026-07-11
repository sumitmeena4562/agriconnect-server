const mongoose = require('mongoose');

const vehicleTypeSchema = new mongoose.Schema({
    vehicleName: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    vehicleCategory: {
        type: String,
        required: true,
        trim: true
    },
    capacityKg: {
        type: Number,
        required: true,
        min: 1
    },
    maxOrders: {
        type: Number,
        required: true,
        min: 1
    },
    fuelType: [{
        type: String,
        trim: true
    }],
    batteryRange: {
        type: String,
        trim: true
    },
    temperatureRange: {
        type: String,
        trim: true
    },
    dimensions: {
        length: { type: String, trim: true },
        width: { type: String, trim: true },
        height: { type: String, trim: true }
    },
    useCase: {
        type: String,
        trim: true
    },
    requiredDocuments: [{
        type: String,
        trim: true
    }]
}, { timestamps: true });

const VehicleType = mongoose.model('VehicleType', vehicleTypeSchema);
module.exports = VehicleType;
