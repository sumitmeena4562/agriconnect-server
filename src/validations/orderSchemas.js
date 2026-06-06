const { z } = require('zod');

// Schema for POST /api/v1/orders — Create order request
const createOrderSchema = z.object({
    cropId: z.string()
        .min(1, 'Crop ID is required')
        .regex(/^[0-9a-fA-F]{24}$/, 'Invalid Crop ID format'),
    requestedQuantity: z.number({
        required_error: 'Requested quantity is required',
        invalid_type_error: 'Requested quantity must be a number'
    }).positive('Quantity must be greater than 0'),
    offeredPrice: z.number({
        invalid_type_error: 'Offered price must be a number'
    }).nonnegative('Offered price cannot be negative').optional(),
    message: z.string().max(500, 'Message too long').optional(),
    pickupDate: z.string()
        .refine(val => !val || !isNaN(Date.parse(val)), { message: 'Invalid pickup date format' })
        .optional(),
    vehicleNumber: z.string().max(20, 'Vehicle number too long').optional(),
    deliveryNotes: z.string().max(300, 'Delivery notes too long').optional(),
});

// Schema for PATCH /api/v1/orders/:id/status — Update order status
const updateOrderStatusSchema = z.object({
    status: z.enum(
        ['Pending', 'Accepted', 'Rejected', 'Completed', 'Cancelled'],
        { errorMap: () => ({ message: 'Invalid status value' }) }
    ),
    otp: z.string()
        .length(4, 'OTP must be exactly 4 digits')
        .regex(/^[0-9]{4}$/, 'OTP must be numeric')
        .optional(),
});

// Schema for PATCH /api/v1/orders/:id/payment — Vendor submits payment
const submitPaymentSchema = z.object({
    method: z.enum(
        ['UPI', 'Cash', 'Bank Transfer', 'Cheque'],
        { errorMap: () => ({ message: 'Invalid payment method. Use: UPI, Cash, Bank Transfer, Cheque' }) }
    ),
    upiRef: z.string().max(100, 'Reference number too long').optional(),
    note: z.string().max(300, 'Note too long').optional(),
});

// Schema for PATCH /api/v1/orders/:id/payment/verify — Farmer verifies payment
const verifyPaymentSchema = z.object({
    action: z.enum(
        ['confirm', 'reject'],
        { errorMap: () => ({ message: 'Action must be "confirm" or "reject"' }) }
    ),
});

module.exports = {
    createOrderSchema,
    updateOrderStatusSchema,
    submitPaymentSchema,
    verifyPaymentSchema,
};
