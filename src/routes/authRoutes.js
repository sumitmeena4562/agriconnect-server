const express = require('express');
const rateLimit = require('express-rate-limit');
const { sendOtp, verifyOtp, checkUserExists, login, googleLogin } = require('../controllers/authController');
const validateRequest = require('../middleware/validateRequest');
const { sendOtpSchema, verifyOtpSchema, checkUserSchema, loginSchema, googleLoginSchema } = require('../validations/authSchemas');

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

// Auth Routes
router.post('/login', validateRequest(loginSchema), login);
router.post('/google-login', validateRequest(googleLoginSchema), googleLogin);

router.post('/send-otp', otpLimiter, validateRequest(sendOtpSchema), sendOtp);
router.post('/verify-otp', otpLimiter, validateRequest(verifyOtpSchema), verifyOtp);
router.post('/check-user', validateRequest(checkUserSchema), checkUserExists);

module.exports = router;
