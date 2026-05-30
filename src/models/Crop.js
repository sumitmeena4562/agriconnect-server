const mongoose = require('mongoose');

const cropSchema = new mongoose.Schema({
  farmerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Vegetables', 'Fruits', 'Grains', 'Pulses', 'Spices', 'Others']
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true,
    enum: ['Kg', 'Quintal', 'Ton']
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['Available', 'Sold Out'],
    default: 'Available'
  },
  harvestDate: {
    type: Date,
    required: true
  },
  description: {
    type: String,
    trim: true,
    maxLength: 500
  },
  images: [{
    type: String // We will store Base64 strings or URLs here
  }]
}, { timestamps: true });

// Index for faster queries
cropSchema.index({ farmerId: 1, status: 1 });

const Crop = mongoose.model('Crop', cropSchema);

module.exports = Crop;
