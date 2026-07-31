const mongoose = require('mongoose');

const farmerProfileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    location: {
        state: { type: String, required: true },
        district: { type: String, required: true },
        village: { type: String, required: true },
        coordinates: {
            lat: { type: Number },
            lng: { type: Number }
        }
    },
    kycDetails: {
        aadhaarNumber: { type: String, default: '' },
        panNumber: { type: String, default: '' },
        kccCardId: { type: String, default: '' }
    },
    farmDetails: {
        landSize: { type: Number, default: 0 },
        landHoldingAcres: { type: Number, default: 0 },
        landUnit: { type: String, default: 'Acres' },
        crops: { type: String, default: '' },
        irrigation: { type: String, default: '' }
    },
    isVerified: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const FarmerProfile = mongoose.model('FarmerProfile', farmerProfileSchema);
module.exports = FarmerProfile;
