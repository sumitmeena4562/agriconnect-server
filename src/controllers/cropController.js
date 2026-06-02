const Crop = require('../models/Crop');
const asyncHandler = require('../middleware/asyncHandler');

const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

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
    const cleanKeyword = keyword.replace('#', '').trim();
    const escapedKeyword = escapeRegExp(cleanKeyword);
    const orConditions = [
      { name: { $regex: escapedKeyword, $options: 'i' } },
      { variety: { $regex: escapedKeyword, $options: 'i' } }
    ];

    const mongoose = require('mongoose');
    // If it's a valid 24-character ObjectId
    if (mongoose.Types.ObjectId.isValid(cleanKeyword)) {
      orConditions.push({ _id: cleanKeyword });

      const OrderRequest = require('../models/OrderRequest');
      const order = await OrderRequest.findById(cleanKeyword);
      if (order && order.crop) {
        orConditions.push({ _id: order.crop });
      }
    } 
    // If it's a short 6-character hex suffix (Order ID)
    else if (/^[0-9a-fA-F]{6}$/.test(cleanKeyword)) {
      const OrderRequest = require('../models/OrderRequest');
      const allOrders = await OrderRequest.find({});
      const matchingOrders = allOrders.filter(o => o._id.toString().endsWith(cleanKeyword.toLowerCase()));
      if (matchingOrders.length > 0) {
        matchingOrders.forEach(o => {
          if (o.crop) orConditions.push({ _id: o.crop });
        });
      }
    }

    query.$or = orConditions;
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
  const crop = await Crop.findById(req.params.id).populate('farmerId', 'name phone location');

  if (!crop) {
    return res.status(404).json({
      success: false,
      error: 'Crop not found'
    });
  }

  // If user is a farmer, they can only view their own crops
  if (req.user.role === 'FARMER' && crop.farmerId._id.toString() !== req.user.id) {
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

  const allowedFields = [
    'name', 'category', 'quantity', 'unit', 'price', 'status',
    'harvestDate', 'description', 'variety', 'location', 'farmingMethod',
    'qualityGrade', 'minOrderQuantity', 'logisticsOption', 'availabilityStatus',
    'paymentTerms', 'images'
  ];

  const updateData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });

  crop = await Crop.findByIdAndUpdate(req.params.id, updateData, {
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
// @desc    Toggle crop status (Available / Sold Out)
// @route   PATCH /api/crops/:id/status
// @access  Private
const toggleCropStatus = asyncHandler(async (req, res) => {
  const crop = await Crop.findById(req.params.id);

  if (!crop) {
    return res.status(404).json({ success: false, error: 'Crop not found' });
  }

  // Ensure user owns the crop
  if (crop.farmerId.toString() !== req.user.id) {
    return res.status(403).json({ success: false, error: 'Not authorized to update this crop' });
  }

  crop.status = crop.status === 'Available' ? 'Sold Out' : 'Available';
  await crop.save();

  res.status(200).json({
    success: true,
    data: crop,
    message: `Crop marked as ${crop.status}`
  });
});

// @desc    Increment crop view count
// @route   PATCH /api/crops/:id/view
// @access  Public / Private
const incrementCropView = asyncHandler(async (req, res) => {
  const crop = await Crop.findByIdAndUpdate(
    req.params.id,
    { $inc: { views: 1 } },
    { new: true }
  );

  if (!crop) {
    return res.status(404).json({ success: false, error: 'Crop not found' });
  }

  res.status(200).json({
    success: true,
    data: { views: crop.views }
  });
});

// @desc    Get all crops for Marketplace (Vendor/Customer view)
// @route   GET /api/crops/marketplace
// @access  Private (Vendor/Customer)
const getMarketplaceCrops = asyncHandler(async (req, res) => {
  const { keyword, category, state, city, sort, page = 1, limit = 10 } = req.query;

  // Only show available crops
  const query = { status: 'Available' };

  if (keyword) {
    const cleanKeyword = keyword.replace('#', '').trim();
    const escapedKeyword = escapeRegExp(cleanKeyword);
    const orConditions = [
      { name: { $regex: escapedKeyword, $options: 'i' } },
      { variety: { $regex: escapedKeyword, $options: 'i' } }
    ];

    const mongoose = require('mongoose');
    // If it's a valid 24-character ObjectId
    if (mongoose.Types.ObjectId.isValid(cleanKeyword)) {
      orConditions.push({ _id: cleanKeyword });

      const OrderRequest = require('../models/OrderRequest');
      const order = await OrderRequest.findById(cleanKeyword);
      if (order && order.crop) {
        orConditions.push({ _id: order.crop });
      }
    } 
    // If it's a short 6-character hex suffix (Order ID)
    else if (/^[0-9a-fA-F]{6}$/.test(cleanKeyword)) {
      const OrderRequest = require('../models/OrderRequest');
      const allOrders = await OrderRequest.find({});
      const matchingOrders = allOrders.filter(o => o._id.toString().endsWith(cleanKeyword.toLowerCase()));
      if (matchingOrders.length > 0) {
        matchingOrders.forEach(o => {
          if (o.crop) orConditions.push({ _id: o.crop });
        });
      }
    }

    query.$or = orConditions;
  }

  if (category && category !== 'All') {
    query.category = category;
  }

  // Location filtering (Regex match on the string)
  if (state && city) {
    const escapedState = escapeRegExp(state);
    const escapedCity = escapeRegExp(city);
    query.location = { $regex: `(?=.*${escapedState})(?=.*${escapedCity})`, $options: 'i' };
  } else if (state) {
    query.location = { $regex: escapeRegExp(state), $options: 'i' };
  } else if (city) {
    query.location = { $regex: escapeRegExp(city), $options: 'i' };
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

  // Execute Query - Populate Farmer Info
  const crops = await Crop.find(query)
    .populate('farmerId', 'name phone location')
    .sort(sortObj)
    .skip(skip)
    .limit(limitNum);

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

module.exports = {
  addCrop,
  getFarmerCrops,
  getCropById,
  updateCrop,
  deleteCrop,
  toggleCropStatus,
  incrementCropView,
  getMarketplaceCrops
};
