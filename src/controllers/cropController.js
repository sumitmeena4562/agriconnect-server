const Crop = require('../models/Crop');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Add a new crop
// @route   POST /api/crops
// @access  Private (Farmer only)
const addCrop = asyncHandler(async (req, res) => {
  const { 
    name, category, quantity, unit, price, harvestDate, description, images,
    variety, location, farmingMethod, qualityGrade, minOrderQuantity, logisticsOption, availabilityStatus, paymentTerms
  } = req.body;

  const crop = await Crop.create({
    farmerId: req.user.id, // Set by protect middleware
    name,
    category,
    quantity,
    unit,
    price,
    harvestDate,
    description,
    variety,
    location,
    farmingMethod,
    qualityGrade,
    minOrderQuantity,
    logisticsOption,
    availabilityStatus,
    paymentTerms,
    images: images || []
  });

  res.status(201).json({
    success: true,
    data: crop,
    message: 'Crop added successfully'
  });
});

// @desc    Get all crops for logged in farmer with search, filter and pagination
// @route   GET /api/crops
// @access  Private (Farmer only)
const getFarmerCrops = asyncHandler(async (req, res) => {
  const { keyword, category, sort, page = 1, limit = 10 } = req.query;

  // Build Query Object
  const query = { farmerId: req.user.id };

  if (keyword) {
    query.name = { $regex: keyword, $options: 'i' };
  }

  if (category && category !== 'All') {
    query.category = category;
  }

  // Build Sort Object
  let sortObj = { createdAt: -1 }; // Default: Newest first
  if (sort === 'price_asc') sortObj = { price: 1 };
  if (sort === 'price_desc') sortObj = { price: -1 };
  if (sort === 'oldest') sortObj = { createdAt: 1 };

  // Pagination Math
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Execute Query
  const crops = await Crop.find(query)
    .sort(sortObj)
    .skip(skip)
    .limit(limitNum);

  // Get total count for pagination
  const total = await Crop.countDocuments(query);

  res.status(200).json({
    success: true,
    count: crops.length,
    total,
    totalPages: Math.ceil(total / limitNum),
    currentPage: pageNum,
    data: crops
  });
});

// @desc    Get single crop
// @route   GET /api/crops/:id
// @access  Private
const getCropById = asyncHandler(async (req, res) => {
  const crop = await Crop.findById(req.params.id);

  if (!crop) {
    return res.status(404).json({
      success: false,
      error: 'Crop not found'
    });
  }

  // If user is a farmer, they can only view their own crops
  if (req.user.role === 'FARMER' && crop.farmerId.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: 'Not authorized to access this crop'
    });
  }

  res.status(200).json({
    success: true,
    data: crop
  });
});

// @desc    Update crop
// @route   PUT /api/crops/:id
// @access  Private
const updateCrop = asyncHandler(async (req, res) => {
  let crop = await Crop.findById(req.params.id);

  if (!crop) {
    return res.status(404).json({
      success: false,
      error: 'Crop not found'
    });
  }

  // Ensure user owns the crop
  if (crop.farmerId.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: 'Not authorized to update this crop'
    });
  }

  crop = await Crop.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: crop,
    message: 'Crop updated successfully'
  });
});

// @desc    Delete crop
// @route   DELETE /api/crops/:id
// @access  Private
const deleteCrop = asyncHandler(async (req, res) => {
  const crop = await Crop.findById(req.params.id);

  if (!crop) {
    return res.status(404).json({
      success: false,
      error: 'Crop not found'
    });
  }

  // Ensure user owns the crop
  if (crop.farmerId.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: 'Not authorized to delete this crop'
    });
  }

  await crop.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
    message: 'Crop deleted successfully'
  });
});

module.exports = {
  addCrop,
  getFarmerCrops,
  getCropById,
  updateCrop,
  deleteCrop
};
