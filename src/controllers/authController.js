const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Otp = require('../models/Otp');
const sendEmail = require('../utils/sendEmail');

// @route   POST /api/auth/send-otp
// @desc    Generate a 6-digit OTP and send it via Email
// @access  Public
const sendOtp = asyncHandler(async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
        throw new ErrorResponse('Please provide an email address', 400);
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

    if (!email || !otp) {
        throw new ErrorResponse('Please provide email and OTP', 400);
    }

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

module.exports = {
    sendOtp,
    verifyOtp
};
