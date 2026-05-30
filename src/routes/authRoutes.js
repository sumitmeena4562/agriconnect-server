const express = require('express');
const rateLimit = require('express-rate-limit');
const { sendOtp, verifyOtp, checkUserExists, login, googleLogin, forgotPassword, resetPassword, sendLoginOtp, verifyLoginOtp } = require('../controllers/authController');
const validateRequest = require('../middleware/validateRequest');
const { sendOtpSchema, verifyOtpSchema, checkUserSchema, loginSchema, googleLoginSchema, forgotPasswordSchema, resetPasswordSchema, sendLoginOtpSchema, verifyLoginOtpSchema } = require('../validations/authSchemas');

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
router.post('/forgot-password', validateRequest(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validateRequest(resetPasswordSchema), resetPassword);

router.post('/login-otp/send', otpLimiter, validateRequest(sendLoginOtpSchema), sendLoginOtp);
router.post('/login-otp/verify', otpLimiter, validateRequest(verifyLoginOtpSchema), verifyLoginOtp);

router.post('/send-otp', otpLimiter, validateRequest(sendOtpSchema), sendOtp);
router.post('/verify-otp', otpLimiter, validateRequest(verifyOtpSchema), verifyOtp);
router.post('/check-user', validateRequest(checkUserSchema), checkUserExists);

module.exports = router;
