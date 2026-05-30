const express = require('express');
const rateLimit = require('express-rate-limit');
const { sendOtp, verifyOtp } = require('../controllers/authController');

const router = express.Router();

// Rate limiting for OTP: max 5 requests per 10 minutes per IP
const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5,
    message: {
        success: false,
        error: 'Too many OTP requests from this IP, please try again after 10 minutes.'
    }
});

router.post('/send-otp', otpLimiter, sendOtp);
router.post('/verify-otp', otpLimiter, verifyOtp);

module.exports = router;
