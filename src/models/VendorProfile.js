const mongoose = require('mongoose');

const vendorProfileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    businessName: { 
        type: String, 
        required: true 
    },
    gstNumber: { 
        type: String, 
        default: '' 
    },
    interestedCategories: [{
        type: String,
        enum: ['Vegetables', 'Fruits', 'Grains', 'Pulses', 'Spices', 'Others']
    }],
    godownAddress: { 
        type: String, 
        required: true 
    },
    city: { 
        type: String, 
        required: true 
    },
    state: { 
        type: String, 
        required: true 
    },
    rating: {
        type: Number,
        default: 0
    },
    totalOrders: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

const VendorProfile = mongoose.model('VendorProfile', vendorProfileSchema);
module.exports = VendorProfile;
