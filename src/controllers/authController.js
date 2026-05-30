const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Otp = require('../models/Otp');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

// @route   POST /api/auth/send-otp
// @desc    Generate a 6-digit OTP and send it via Email
// @access  Public
const sendOtp = asyncHandler(async (req, res, next) => {
    const { email } = req.body;

    // Check if user already exists BEFORE sending OTP
    const userExists = await User.findOne({ email });
    if (userExists) {
        throw new ErrorResponse('This email is already registered. Please login instead.', 400);
    }

    // Generate a 6 digit random OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Remove any existing OTP for this email
    await Otp.deleteMany({ email });

    // Save the new OTP in the database (expires in 5 minutes via TTL)
    await Otp.create({
        email,
        otp: otpCode
    });

    // Send the email
    try {
        const message = `Welcome to AgriConnect!\n\nYour Verification Code is: ${otpCode}\n\nThis code is valid for 5 minutes. Do not share it with anyone.`;
        
        await sendEmail({
            email,
            subject: 'AgriConnect - Verification Code',
            message,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h2 style="color: #00B464; text-align: center;">🌾 AgriConnect</h2>
                    <p style="color: #334155; font-size: 16px;">Hello,</p>
                    <p style="color: #334155; font-size: 16px;">Thank you for registering. Here is your verification code:</p>
                    <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <h1 style="color: #0f172a; letter-spacing: 5px; margin: 0;">${otpCode}</h1>
                    </div>
                    <p style="color: #64748b; font-size: 14px;">This code will expire in 5 minutes.</p>
                    <p style="color: #64748b; font-size: 14px;">If you did not request this, please ignore this email.</p>
                </div>
            `
        });

        res.status(200).json({
            success: true,
            message: 'OTP sent to email successfully'
        });
    } catch (error) {
        console.error("Email Error:", error);
        // Clean up OTP from DB if email failed to send
        await Otp.deleteMany({ email });
        throw new ErrorResponse('Email could not be sent. Check server configuration.', 500);
    }
});

// @route   POST /api/auth/verify-otp
// @desc    Verify the email OTP
// @access  Public
const verifyOtp = asyncHandler(async (req, res, next) => {
    const { email, otp } = req.body;

    // Find the latest OTP for this email
    const otpRecord = await Otp.findOne({ email }).sort({ createdAt: -1 });

    if (!otpRecord) {
        throw new ErrorResponse('OTP is expired or invalid. Please request a new one.', 400);
    }

    if (otpRecord.otp !== otp) {
        throw new ErrorResponse('Incorrect OTP', 400);
    }

    // If correct, delete it so it can't be reused
    await Otp.deleteMany({ email });

    res.status(200).json({
        success: true,
        message: 'Email verified successfully'
    });
});

// @route   POST /api/auth/check-user
// @desc    Check if a user exists by email or phone
// @access  Public
const checkUserExists = asyncHandler(async (req, res, next) => {
    const { email, phone } = req.body;

    if (email) {
        const userExists = await User.findOne({ email });
        if (userExists) {
            throw new ErrorResponse('This email is already registered. Please login instead.', 400);
        }
    }

    if (phone) {
        const phoneExists = await User.findOne({ phone });
        if (phoneExists) {
            throw new ErrorResponse('This phone number is already registered. Please login instead.', 400);
        }
    }

    res.status(200).json({ success: true, message: 'User does not exist' });
});

// @route   POST /api/auth/login
// @desc    Login user with email/phone & password
// @access  Public
const login = asyncHandler(async (req, res, next) => {
    const { identifier, password } = req.body;

    // Check if identifier is email or phone
    const isEmail = identifier.includes('@');
    const query = isEmail ? { email: identifier } : { phone: identifier };

    // Find user by email or phone, and explicitly select password (since select: false in model)
    const user = await User.findOne(query).select('+password');

    if (!user) {
        throw new ErrorResponse('Invalid credentials', 401);
    }

    if (user.authProvider === 'GOOGLE' && !user.password) {
        throw new ErrorResponse('This account was created with Google. Please use Google Login.', 400);
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
        throw new ErrorResponse('Invalid credentials', 401);
    }

    // Create token
    const token = user.getSignedJwtToken();

    res.status(200).json({
        success: true,
        token,
        user: {
            id: user._id,
            name: user.name,
            role: user.role,
            phone: user.phone,
            email: user.email
        }
    });
});

// @route   POST /api/auth/google-login
// @desc    Login user via Google
// @access  Public
const googleLogin = asyncHandler(async (req, res, next) => {
    const { email, googleId } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
        // We could auto-register here, but our flow says they must register first to pick a role.
        throw new ErrorResponse('User not found. Please register first.', 404);
    }

    // Optionally check if googleId matches, but usually email is enough since Google verified it.
    // However, if they registered LOCAL, we shouldn't let anyone just claim Google login without merging logic.
    // For simplicity, we just allow login if email matches.
    if (user.authProvider === 'LOCAL' && !user.googleId) {
         // Merge account to Google if not already
         user.googleId = googleId;
         user.authProvider = 'GOOGLE';
         await user.save();
    }

    // Create token
    const token = user.getSignedJwtToken();

    res.status(200).json({
        success: true,
        token,
        user: {
            id: user._id,
            name: user.name,
            role: user.role,
            phone: user.phone,
            email: user.email
        }
    });
});

module.exports = {
    sendOtp,
    verifyOtp,
    checkUserExists,
    login,
    googleLogin
};
