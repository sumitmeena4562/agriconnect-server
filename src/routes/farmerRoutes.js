const express = require('express');
const { registerFarmer, getProfile, updateProfile, changePassword, getFarmerDashboardStats } = require('../controllers/farmerController');
const validateRequest = require('../middleware/validateRequest');
const { registerFarmerSchema, updateFarmerProfileSchema } = require('../validations/authSchemas');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// @route   POST /api/farmers/register
// @desc    Register a new farmer
router.post('/register', validateRequest(registerFarmerSchema), registerFarmer);

// @route   GET /api/farmers/stats
// @desc    Get dashboard statistics for logged-in farmer
router.get('/stats', protect, authorize('FARMER'), getFarmerDashboardStats);

// @route   GET /api/farmers/profile
// @desc    Get current farmer profile
router.get('/profile', protect, authorize('FARMER'), getProfile);

// @route   PUT /api/farmers/profile
// @desc    Update current farmer profile
router.put('/profile', protect, authorize('FARMER'), validateRequest(updateFarmerProfileSchema), updateProfile);

// @route   PUT /api/farmers/change-password
// @desc    Change password for logged-in farmer
router.put('/change-password', protect, authorize('FARMER'), changePassword);

module.exports = router;
