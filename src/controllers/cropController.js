const Crop = require('../models/Crop');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Add a new crop
// @route   POST /api/crops
// @access  Private (Farmer only)
const addCrop = asyncHandler(async (req, res) => {
  const { name, category, quantity, unit, price, harvestDate, description, images } = req.body;

  const crop = await Crop.create({
    farmerId: req.user.id, // Set by protect middleware
    name,
    category,
    quantity,
    unit,
    price,
    harvestDate,
    description,
    images: images || []
  });

  res.status(201).json({
    success: true,
    data: crop,
    message: 'Crop added successfully'
  });
});

// @desc    Get all crops for logged in farmer
// @route   GET /api/crops
// @access  Private (Farmer only)
const getFarmerCrops = asyncHandler(async (req, res) => {
  const crops = await Crop.find({ farmerId: req.user.id }).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: crops.length,
    data: crops
  });
});

module.exports = {
  addCrop,
  getFarmerCrops
};
