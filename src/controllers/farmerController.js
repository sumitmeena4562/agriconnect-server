const User = require('../models/User');
const FarmerProfile = require('../models/FarmerProfile');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// @route   POST /api/farmers/register
// @desc    Register a new farmer with a User account and FarmerProfile
// @access  Public
const registerFarmer = asyncHandler(async (req, res, next) => {
    const { phone, email, password, name, state, district, village, landSize, landUnit, crops, irrigation, authProvider, googleId } = req.body;

    // Validation: Password is required only if it's LOCAL
    if (!phone || !name || !state || !district || !village || !landSize || !crops || !irrigation) {
        throw new ErrorResponse('Please provide all required fields', 400);
    }

    if ((!authProvider || authProvider === 'LOCAL') && !password) {
        throw new ErrorResponse('Please provide a password', 400);
    }

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
                village
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

module.exports = { registerFarmer };
