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
    farmDetails: {
        landSize: { type: Number, required: true },
        landUnit: { type: String, required: true },
        crops: { type: String, required: true },
        irrigation: { type: String, required: true }
    },
    isVerified: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const FarmerProfile = mongoose.model('FarmerProfile', farmerProfileSchema);
module.exports = FarmerProfile;
