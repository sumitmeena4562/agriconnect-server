const express = require('express');
const { registerFarmer } = require('../controllers/farmerController');
const router = express.Router();

// @route   POST /api/farmers/register
// @desc    Register a new farmer
router.post('/register', registerFarmer);

module.exports = router;
