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
    let { identifier, password } = req.body;
    identifier = identifier.trim();

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

// @route   POST /api/auth/forgot-password
// @desc    Initiate password reset (send OTP to email)
// @access  Public
const forgotPassword = asyncHandler(async (req, res, next) => {
    const { identifier } = req.body;

    const isEmail = identifier.includes('@');
    const query = isEmail ? { email: identifier } : { phone: identifier };

    const user = await User.findOne(query);

    if (!user) {
        throw new ErrorResponse('User not found. Please check your details.', 404);
    }

    if (user.authProvider === 'GOOGLE') {
        throw new ErrorResponse('This account is linked with Google. Please use Google Login.', 400);
    }

    if (!user.email) {
        throw new ErrorResponse('No email associated with this account. Cannot send OTP.', 400);
    }

    const email = user.email;

    // Generate a 6 digit random OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Remove any existing OTP for this email
    await Otp.deleteMany({ email });

    // Save the new OTP in the database (expires in 5 minutes via TTL)
    await Otp.create({ email, otp: otpCode });

    // Send the email
    try {
        const message = `You requested a password reset.\n\nYour Verification Code is: ${otpCode}\n\nThis code is valid for 5 minutes.`;
        
        await sendEmail({
            email,
            subject: 'AgriConnect - Password Reset Code',
            message,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h2 style="color: #00B464; text-align: center;">🌾 AgriConnect</h2>
                    <p style="color: #334155; font-size: 16px;">Hello ${user.name},</p>
                    <p style="color: #334155; font-size: 16px;">You requested a password reset. Here is your verification code:</p>
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
            email: email, // Return email so frontend knows where it was sent
            message: 'OTP sent to registered email'
        });
    } catch (error) {
        console.error("Email Error:", error);
        await Otp.deleteMany({ email });
        throw new ErrorResponse('Email could not be sent. Check server configuration.', 500);
    }
});

// @route   POST /api/auth/reset-password
// @desc    Verify OTP and update password
// @access  Public
const resetPassword = asyncHandler(async (req, res, next) => {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
        throw new ErrorResponse('User not found.', 404);
    }

    // Find the latest OTP for this email
    const otpRecord = await Otp.findOne({ email }).sort({ createdAt: -1 });

    if (!otpRecord || otpRecord.otp !== otp) {
        throw new ErrorResponse('OTP is expired or invalid.', 400);
    }

    // Update user password
    user.password = newPassword;
    await user.save(); // Pre-save hook will hash it

    // Delete used OTP
    await Otp.deleteMany({ email });

    res.status(200).json({
        success: true,
        message: 'Password reset successfully. You can now login.'
    });
});

// @route   POST /api/auth/login-otp/send
// @desc    Send OTP for password-less login
// @access  Public
const sendLoginOtp = asyncHandler(async (req, res, next) => {
    let { identifier } = req.body;
    identifier = identifier.trim();

    const isEmail = identifier.includes('@');
    const query = isEmail ? { email: identifier } : { phone: identifier };

    const user = await User.findOne(query);

    if (!user) {
        throw new ErrorResponse('No account found with this Email/Phone. Please register first.', 404);
    }

    if (user.authProvider === 'GOOGLE') {
        throw new ErrorResponse('This account is linked with Google. Please use Google Login.', 400);
    }

    if (!user.email) {
        throw new ErrorResponse('No email linked to this account for OTP verification.', 400);
    }

    const email = user.email;
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    await Otp.deleteMany({ email });
    await Otp.create({ email, otp: otpCode });

    try {
        const message = `Your Login OTP is: ${otpCode}\n\nThis code is valid for 5 minutes.`;
        await sendEmail({
            email,
            subject: 'AgriConnect - Login OTP',
            message,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h2 style="color: #00B464; text-align: center;">🌾 AgriConnect</h2>
                    <p style="color: #334155; font-size: 16px;">Hello ${user.name},</p>
                    <p style="color: #334155; font-size: 16px;">Your One Time Password (OTP) for login is:</p>
                    <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <h1 style="color: #0f172a; letter-spacing: 5px; margin: 0;">${otpCode}</h1>
                    </div>
                    <p style="color: #64748b; font-size: 14px;">This code will expire in 5 minutes.</p>
                </div>
            `
        });

        res.status(200).json({
            success: true,
            email: email,
            message: 'OTP sent to registered email'
        });
    } catch (error) {
        console.error("Email Error:", error);
        await Otp.deleteMany({ email });
        throw new ErrorResponse('Email could not be sent. Please try again.', 500);
    }
});

// @route   POST /api/auth/login-otp/verify
// @desc    Verify OTP and return JWT token
// @access  Public
const verifyLoginOtp = asyncHandler(async (req, res, next) => {
    let { identifier, otp } = req.body;
    identifier = identifier.trim();

    const isEmail = identifier.includes('@');
    const query = isEmail ? { email: identifier } : { phone: identifier };

    const user = await User.findOne(query);
    if (!user) {
        throw new ErrorResponse('User not found.', 404);
    }

    const otpRecord = await Otp.findOne({ email: user.email }).sort({ createdAt: -1 });

    if (!otpRecord || otpRecord.otp !== otp) {
        throw new ErrorResponse('Invalid or expired OTP.', 400);
    }

    await Otp.deleteMany({ email: user.email });

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

const VendorProfile = require('../models/VendorProfile');

// @route   POST /api/auth/register-vendor
// @desc    Register a new Vendor (Aggregator)
// @access  Public
const registerVendor = asyncHandler(async (req, res, next) => {
    const { phone, email, password, name, businessName, gstNumber, interestedCategories, godownAddress, city, state } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ phone });
    if (userExists) {
        throw new ErrorResponse('User with this phone number is already registered.', 400);
    }

    if (email) {
        const emailExists = await User.findOne({ email });
        if (emailExists) {
            throw new ErrorResponse('User with this email is already registered.', 400);
        }
    }

    // Create the User (core details only)
    const user = await User.create({
        phone,
        email: email || undefined,
        password,
        name,
        role: 'VENDOR'
    });

    if (!user) {
        throw new ErrorResponse('Invalid user data received', 400);
    }

    // Create the Vendor Profile linked to the User
    const vendorProfile = await VendorProfile.create({
        user: user._id,
        businessName: businessName || '',
        gstNumber: gstNumber || '',
        interestedCategories: interestedCategories || [],
        godownAddress: godownAddress || '',
        city: city || '',
        state: state || ''
    });

    // Generate JWT Token
    const token = user.getSignedJwtToken();

    res.status(201).json({
        success: true,
        message: 'Vendor Registration successful!',
        data: {
            token,
            user: {
                id: user._id,
                name: user.name,
                phone: user.phone,
                email: user.email,
                role: user.role,
                vendorProfile: {
                    businessName: vendorProfile.businessName,
                    interestedCategories: vendorProfile.interestedCategories,
                    city: vendorProfile.city
                }
            }
        }
    });
});

module.exports = {
    sendOtp,
    verifyOtp,
    checkUserExists,
    login,
    googleLogin,
    forgotPassword,
    resetPassword,
    sendLoginOtp,
    verifyLoginOtp,
    registerVendor
};
