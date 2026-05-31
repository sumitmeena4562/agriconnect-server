const express = require('express');
const { registerFarmer, getProfile, updateProfile } = require('../controllers/farmerController');
const validateRequest = require('../middleware/validateRequest');
const { registerFarmerSchema } = require('../validations/authSchemas');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// @route   POST /api/farmers/register
// @desc    Register a new farmer
router.post('/register', validateRequest(registerFarmerSchema), registerFarmer);

// @route   GET /api/farmers/profile
// @desc    Get current farmer profile
router.get('/profile', protect, authorize('FARMER'), getProfile);

// @route   PUT /api/farmers/profile
// @desc    Update current farmer profile
router.put('/profile', protect, authorize('FARMER'), updateProfile);

module.exports = router;
