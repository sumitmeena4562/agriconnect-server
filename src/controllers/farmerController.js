const User = require('../models/User');
const FarmerProfile = require('../models/FarmerProfile');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// @route   POST /api/farmers/register
// @desc    Register a new farmer with a User account and FarmerProfile
// @access  Public
const registerFarmer = asyncHandler(async (req, res, next) => {
    const { phone, email, password, name, state, district, village, landSize, landUnit, crops, irrigation, authProvider, googleId, lat, lng } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ phone });
    if (userExists) {
        throw new ErrorResponse('User with this phone number is already registered.', 400);
    }

    // Check if email already exists (if provided)
    if (email) {
        const emailExists = await User.findOne({ email });
        if (emailExists) {
            throw new ErrorResponse('User with this email is already registered.', 400);
        }
    }

    // 1. Create the Base User (Password will be hashed automatically by the pre-save hook)
    const user = await User.create({
        phone,
        email: email || undefined, // Prevents duplicate key error for empty strings
        password: authProvider === 'GOOGLE' ? undefined : password,
        name,
        authProvider: authProvider || 'LOCAL',
        googleId,
        role: 'FARMER'
    });

    if (!user) {
        throw new ErrorResponse('Invalid user data received', 400);
    }

    // 2. Create the FarmerProfile linked to this User with Rollback Logic
    let farmerProfile;
    try {
        farmerProfile = await FarmerProfile.create({
            user: user._id,
            location: {
                state,
                district,
                village,
                coordinates: {
                    lat: lat || undefined,
                    lng: lng || undefined
                }
            },
            farmDetails: {
                landSize,
                landUnit,
                crops,
                irrigation
            }
        });
    } catch (profileError) {
        // Rollback: delete the user if profile creation fails
        await User.findByIdAndDelete(user._id);
        console.error("Profile Creation Failed, rolling back user.", profileError);
        throw new ErrorResponse('Failed to create farmer profile. Please try again.', 500);
    }

    // Generate JWT Token
    const token = user.getSignedJwtToken();

    res.status(201).json({
        success: true,
        message: 'Farmer Registration successful!',
        data: {
            token,
            user: {
                id: user._id,
                name: user.name,
                phone: user.phone,
                email: user.email,
                role: user.role
            },
            profileId: farmerProfile._id
        }
    });
});

// @route   GET /api/farmers/profile
// @desc    Get current farmer profile and user details
// @access  Private
const getProfile = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id).select('-password');
    const profile = await FarmerProfile.findOne({ user: req.user.id });

    if (!user) {
        throw new ErrorResponse('User not found', 404);
    }

    res.status(200).json({
        success: true,
        data: {
            user,
            profile
        }
    });
});

// @route   PUT /api/farmers/profile
// @desc    Update farmer user details, bank details and profile
// @access  Private
const updateProfile = asyncHandler(async (req, res, next) => {
    const { name, bankDetails, location, farmDetails } = req.body;

    // 1. Update User details
    const userFields = {};
    if (name) userFields.name = name;
    if (bankDetails) userFields.bankDetails = bankDetails;

    const user = await User.findByIdAndUpdate(
        req.user.id,
        { $set: userFields },
        { new: true, runValidators: true }
    ).select('-password');

    // 2. Update Farmer Profile details
    const profileFields = {};
    if (location) profileFields.location = location;
    if (farmDetails) profileFields.farmDetails = farmDetails;

    const profile = await FarmerProfile.findOneAndUpdate(
        { user: req.user.id },
        { $set: profileFields },
        { new: true, runValidators: true }
    );

    res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
            user,
            profile
        }
    });
});

const mongoose = require('mongoose');
const OrderRequest = require('../models/OrderRequest');
const Crop = require('../models/Crop');
const Driver = require('../models/Driver');
const DeliveryBatch = require('../models/DeliveryBatch');

// @route   GET /api/farmers/stats
// @desc    Get dashboard statistics & analytics for logged in farmer
// @access  Private (Farmer only)
const getFarmerDashboardStats = asyncHandler(async (req, res, next) => {
    const farmerId = req.user.id;

    const user = await User.findById(farmerId).select('name bankDetails');
    const profile = await FarmerProfile.findOne({ user: farmerId }).select('location');

    // Aggregate total earnings from Completed & Accepted orders
    const earningsAgg = await OrderRequest.aggregate([
        { $match: { farmer: new mongoose.Types.ObjectId(farmerId), status: { $in: ['Completed', 'Accepted'] } } },
        { 
            $group: { 
                _id: null, 
                total: { 
                    $sum: { 
                        $ifNull: [
                            '$payment.amount', 
                            { $multiply: [ '$requestedQuantity', { $ifNull: [ '$offeredPrice', 0 ] } ] }
                        ] 
                    } 
                } 
            } 
        }
    ]);
    const totalEarnings = earningsAgg.length > 0 ? earningsAgg[0].total : 0;

    // Aggregate total active crop stock (quantity)
    const stockAgg = await Crop.aggregate([
        { $match: { farmerId: new mongoose.Types.ObjectId(farmerId), availabilityStatus: { $ne: 'Sold Out' } } },
        { $group: { _id: null, totalQty: { $sum: '$quantity' } } }
    ]);
    const totalStockKg = stockAgg.length > 0 ? stockAgg[0].totalQty : 0;

    // Count active crops
    const activeCropsCount = await Crop.countDocuments({
        farmerId: farmerId,
        availabilityStatus: { $ne: 'Sold Out' }
    });

    // Count pending orders
    const pendingOrdersCount = await OrderRequest.countDocuments({
        farmer: farmerId,
        status: 'Pending'
    });

    // Drivers analytics
    const driversCount = await Driver.countDocuments({ farmer: farmerId });
    const availableDriversCount = await Driver.countDocuments({ farmer: farmerId, status: 'Available' });

    // Total orders count
    const totalOrdersCount = await OrderRequest.countDocuments({ farmer: farmerId });

    // Pending order action requests feed
    const pendingOrdersList = await OrderRequest.find({ farmer: farmerId, status: 'Pending' })
        .populate('vendor', 'name phone')
        .populate('crop', 'name unit price')
        .sort({ createdAt: -1 })
        .limit(3);

    // Active batches in transit or assigned
    const activeBatches = await DeliveryBatch.find({
        $or: [{ farmerOwner: farmerId }, { farmerOwner: { $exists: false } }],
        batchStatus: { $in: ['Driver Assigned', 'Out For Delivery', 'Partially Delivered'] }
    })
    .populate('driver', 'name phone vehicleType vehicleNumber')
    .populate({
        path: 'orders',
        populate: { path: 'crop', select: 'name unit' }
    })
    .sort({ updatedAt: -1 })
    .limit(2);

    const hasBankDetails = Boolean(
        user?.bankDetails?.accountNumber && user?.bankDetails?.accountNumber.trim() !== ''
    );

    const locObj = profile?.location || {};
    const locationName = locObj.district 
        ? `${locObj.district}${locObj.state ? `, ${locObj.state}` : ''}`
        : (locObj.village || 'Indore, MP');

    res.status(200).json({
        success: true,
        data: {
            totalEarnings,
            activeCropsCount,
            totalStockKg,
            pendingOrdersCount,
            totalOrdersCount,
            driversCount,
            availableDriversCount,
            pendingOrdersList,
            activeBatches,
            hasBankDetails,
            locationName,
            coordinates: profile?.location?.coordinates || { lat: 22.7196, lng: 75.8577 },
            user: {
                name: user?.name || ''
            }
        }
    });
});

module.exports = { registerFarmer, getProfile, updateProfile, getFarmerDashboardStats };
