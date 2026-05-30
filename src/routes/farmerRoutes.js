const express = require('express');
const { registerFarmer } = require('../controllers/farmerController');
const validateRequest = require('../middleware/validateRequest');
const { registerFarmerSchema } = require('../validations/authSchemas');

const router = express.Router();

// @route   POST /api/farmers/register
// @desc    Register a new farmer
router.post('/register', validateRequest(registerFarmerSchema), registerFarmer);

module.exports = router;
