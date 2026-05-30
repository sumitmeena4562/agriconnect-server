const { z } = require('zod');

// Schema for /api/auth/send-otp
const sendOtpSchema = z.object({
    email: z.string()
        .min(1, 'Please provide an email address')
        .email('Enter a valid email address')
});

// Schema for /api/auth/verify-otp
const verifyOtpSchema = z.object({
    email: z.string()
        .min(1, 'Please provide an email address')
        .email('Enter a valid email address'),
    otp: z.string()
        .min(1, 'Please provide OTP')
        .length(6, 'Enter a valid 6-digit OTP')
        .regex(/^[0-9]+$/, 'OTP can only contain numbers')
});

// Schema for /api/auth/check-user
const checkUserSchema = z.object({
    email: z.string().email('Enter a valid email address').optional(),
    phone: z.string().regex(/^[0-9]{7,15}$/, 'Enter a valid mobile number').optional()
}).refine(data => data.email || data.phone, {
    message: "Either email or phone must be provided"
});

// Schema for /api/farmers/register
const registerFarmerSchema = z.object({
    phone: z.string().regex(/^[0-9]{7,15}$/, 'Enter a valid mobile number'),
    email: z.string().email('Enter a valid email address').optional().or(z.literal('')),
    name: z.string().min(3, 'Name must be at least 3 characters'),
    authProvider: z.enum(['LOCAL', 'GOOGLE']).default('LOCAL'),
    googleId: z.string().optional(),
    
    // Conditional password logic is handled via .superRefine or .refine below
    password: z.string().optional(),
    confirmPassword: z.string().optional(),

    // Location
    state: z.string().min(1, 'State is required'),
    district: z.string().min(3, 'District must be at least 3 characters'),
    village: z.string().min(3, 'Village must be at least 3 characters'),

    // Farm Details
    landSize: z.union([z.string(), z.number()]).transform(val => parseFloat(val)).refine(val => !isNaN(val) && val > 0, { message: 'Land size must be a positive number' }),
    landUnit: z.string().default('acres'),
    crops: z.string().min(3, 'Please list at least one valid crop'),
    irrigation: z.string().min(1, 'Irrigation details are required')
}).refine(data => {
    if (data.authProvider === 'LOCAL') {
        return data.password && data.password.length >= 6;
    }
    return true;
}, {
    message: "Password must be at least 6 characters long",
    path: ["password"]
});

// Schema for /api/auth/login
const loginSchema = z.object({
    identifier: z.string().min(1, 'Email or Phone is required'),
    password: z.string().min(6, 'Password must be at least 6 characters')
});

// Schema for /api/auth/google-login
const googleLoginSchema = z.object({
    email: z.string().email('Valid email is required'),
    googleId: z.string().min(1, 'Google ID is required')
});

// Schema for /api/auth/forgot-password
const forgotPasswordSchema = z.object({
    identifier: z.string().min(1, 'Email or Phone is required')
});

// Schema for /api/auth/reset-password
const resetPasswordSchema = z.object({
    email: z.string().email('Invalid email address'),
    otp: z.string().length(6, 'OTP must be exactly 6 digits'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters long')
});

const sendLoginOtpSchema = z.object({
    identifier: z.string().min(1, 'Email or Phone is required')
});

const verifyLoginOtpSchema = z.object({
    identifier: z.string().min(1, 'Email or Phone is required'),
    otp: z.string().length(6, 'OTP must be exactly 6 digits')
});

module.exports = {
    sendOtpSchema,
    verifyOtpSchema,
    checkUserSchema,
    registerFarmerSchema,
    loginSchema,
    googleLoginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    sendLoginOtpSchema,
    verifyLoginOtpSchema
};
