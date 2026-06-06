const OrderRequest = require('../models/OrderRequest');
const Crop = require('../models/Crop');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const User = require('../models/User');
const MockBankAccount = require('../models/MockBankAccount');
const BankTransaction = require('../models/BankTransaction');
const { createNotification } = require('./notificationController');

// @desc    Send an order request to a farmer
// @route   POST /api/orders
// @access  Private (Vendor only)
const createOrderRequest = asyncHandler(async (req, res) => {
    const { cropId, requestedQuantity, offeredPrice, message, pickupDate, vehicleNumber, deliveryNotes } = req.body;

    const crop = await Crop.findById(cropId);
    if (!crop) {
        throw new ErrorResponse('Crop not found', 404);
    }

    if (crop.status !== 'Available') {
        throw new ErrorResponse('This crop is no longer available', 400);
    }

    if (requestedQuantity > crop.quantity) {
        throw new ErrorResponse(`Requested quantity exceeds available quantity (${crop.quantity} ${crop.unit})`, 400);
    }

    if (requestedQuantity < crop.minOrderQuantity) {
        throw new ErrorResponse(`Minimum order quantity is ${crop.minOrderQuantity} ${crop.unit}`, 400);
    }

    // Check if vendor already sent a pending request for this crop
    const existingRequest = await OrderRequest.findOne({
        crop: cropId,
        vendor: req.user.id,
        status: 'Pending'
    });

    if (existingRequest) {
        throw new ErrorResponse('You already have a pending order request for this crop', 400);
    }

    // Guard against corrupt crop data
    if (!crop.farmerId) {
        throw new ErrorResponse('Crop owner not found. Cannot place order.', 500);
    }

    const orderRequest = await OrderRequest.create({
        crop: cropId,
        farmer: crop.farmerId,
        vendor: req.user.id,
        requestedQuantity,
        offeredPrice: offeredPrice || crop.price,
        message,
        pickupDate,
        vehicleNumber,
        deliveryNotes
    });

    // Populate for response
    await orderRequest.populate('crop', 'name category price unit images');
    await orderRequest.populate('farmer', 'name phone location');

    const vendorUser = await User.findById(req.user.id);
    const vendorName = vendorUser ? vendorUser.name : 'Vendor';
    await createNotification(
        crop.farmerId,
        req.user.id,
        orderRequest._id,
        'ORDER_RECEIVED',
        `New order request! ${vendorName} has sent you a request for ${requestedQuantity} ${crop.unit} of ${crop.name}.`
    );

    res.status(201).json({
        success: true,
        data: orderRequest,
        message: 'Order request sent successfully to the farmer'
    });
});

// @desc    Get all order requests for logged in user (Farmer or Vendor)
// @route   GET /api/orders
// @access  Private
const getOrders = asyncHandler(async (req, res) => {
    let query = {};

    // If Farmer, show requests received. If Vendor/Customer, show requests sent.
    if (req.user.role === 'FARMER') {
        query.farmer = req.user.id;
    } else if (['VENDOR', 'CUSTOMER'].includes(req.user.role)) {
        query.vendor = req.user.id;
    } else {
        // Safe default: restrict to user's own vendor ID to prevent leaking all system orders
        query.vendor = req.user.id;
    }

    // Optional status filter — validate against allowed values (prevents injection)
    const VALID_STATUSES = ['Pending', 'Accepted', 'Rejected', 'Completed', 'Cancelled'];
    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
        query.status = req.query.status;
    }

    // Pagination
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const skip  = (page - 1) * limit;

    const [orders, total] = await Promise.all([
        OrderRequest.find(query)
            .populate('crop', 'name category price unit images variety')
            .populate('farmer', 'name phone location')
            .populate('vendor', 'name phone')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        OrderRequest.countDocuments(query)
    ]);

    res.status(200).json({
        success: true,
        count: orders.length,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        data: orders
    });
});

// @desc    Update order request status (Farmer accepts/rejects, or Vendor cancels)
// @route   PATCH /api/orders/:id/status
// @access  Private
const updateOrderStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['Pending', 'Accepted', 'Rejected', 'Completed', 'Cancelled'];

    if (!validStatuses.includes(status)) {
        throw new ErrorResponse('Invalid status', 400);
    }

    const order = await OrderRequest.findById(req.params.id);

    if (!order) {
        throw new ErrorResponse('Order request not found', 404);
    }

    // Authorization checks
    if (req.user.role === 'FARMER' && order.farmer.toString() !== req.user.id) {
        throw new ErrorResponse('Not authorized to update this order', 403);
    }

    if (['VENDOR', 'CUSTOMER'].includes(req.user.role) && order.vendor.toString() !== req.user.id) {
        throw new ErrorResponse('Not authorized to update this order', 403);
    }

    // State machine transitions validation
    if (order.status === 'Rejected' || order.status === 'Cancelled' || order.status === 'Completed') {
        throw new ErrorResponse(`Cannot update status of a ${order.status.toLowerCase()} order`, 400);
    }

    if (order.status === 'Accepted') {
        if (status !== 'Completed') {
            throw new ErrorResponse('Accepted orders can only be updated to Completed', 400);
        }
    }

    if (order.status === 'Pending') {
        if (!['Accepted', 'Rejected', 'Cancelled'].includes(status)) {
            throw new ErrorResponse('Pending orders can only be Accepted, Rejected, or Cancelled', 400);
        }
    }

    // A Buyer (Vendor or Customer) can only Cancel. A Farmer can Accept/Reject/Complete.
    if (['VENDOR', 'CUSTOMER'].includes(req.user.role) && status !== 'Cancelled') {
        throw new ErrorResponse('Buyers can only cancel an order', 400);
    }

    if (req.user.role === 'FARMER' && status === 'Cancelled') {
        throw new ErrorResponse('Farmers cannot cancel an order', 400);
    }

    // If transitioned to Completed, verify delivery OTP
    if (status === 'Completed') {
        const { otp } = req.body;
        if (!otp) {
            throw new ErrorResponse('Delivery verification OTP is required to complete the order', 400);
        }
        if (!order.deliveryOTP) {
            throw new ErrorResponse('Delivery OTP not found for this order. Please contact support.', 500);
        }
        if (order.deliveryOTP !== otp.toString().trim()) {
            throw new ErrorResponse('Invalid delivery verification OTP. Please verify with the vendor.', 400);
        }
    }

    // If transitioned to Accepted, decrement available quantity from the Crop and generate OTP
    if (status === 'Accepted' && order.status !== 'Accepted') {
        const crop = await Crop.findOneAndUpdate(
            { _id: order.crop, quantity: { $gte: order.requestedQuantity } },
            { $inc: { quantity: -order.requestedQuantity } },
            { new: true }
        );

        if (!crop) {
            // Either the crop is not found, or quantity is insufficient
            const existingCrop = await Crop.findById(order.crop);
            if (!existingCrop) {
                throw new ErrorResponse('Associated crop not found', 404);
            }
            throw new ErrorResponse(`Insufficient crop quantity. Only ${existingCrop.quantity} ${existingCrop.unit} available.`, 400);
        }

        if (crop.quantity === 0) {
            crop.status = 'Sold Out';
            await crop.save();
        }

        // Generate 4-digit OTP for delivery verification
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        order.deliveryOTP = otp;
    }

    order.status = status;
    await order.save();

    // Fetch current user name once (instead of per-branch)
    const currentUser = await User.findById(req.user.id).select('name');
    const currentUserName = currentUser ? currentUser.name : (req.user.role === 'FARMER' ? 'Farmer' : 'Vendor');

    // Trigger notification based on status transitions
    if (status === 'Accepted') {
        await createNotification(
            order.vendor,
            req.user.id,
            order._id,
            'ORDER_ACCEPTED',
            `Your order has been accepted! Farmer ${currentUserName} has accepted your order. Click to check pickup OTP details.`
        );
    } else if (status === 'Rejected') {
        await createNotification(
            order.vendor,
            req.user.id,
            order._id,
            'ORDER_REJECTED',
            `Order request rejected. Farmer ${currentUserName} has rejected your order.`
        );
    } else if (status === 'Completed') {
        // Load crop for correct unit label
        const cropData = await Crop.findById(order.crop).select('name unit');
        const unitLabel = cropData ? cropData.unit : 'units';
        const cropName = cropData ? cropData.name : 'crop';

        // Notify vendor
        await createNotification(
            order.vendor,
            req.user.id,
            order._id,
            'ORDER_COMPLETED',
            `Your order is completed! The transaction for ${order.requestedQuantity} ${unitLabel} of ${cropName} has been successfully completed.`
        );
        // Notify farmer (confirmation)
        await createNotification(
            order.farmer,
            order.vendor,
            order._id,
            'ORDER_COMPLETED',
            `Order delivered! You have successfully handed over ${order.requestedQuantity} ${unitLabel} of ${cropName}. Transaction verified.`
        );
    } else if (status === 'Cancelled') {
        await createNotification(
            order.farmer,
            req.user.id,
            order._id,
            'ORDER_CANCELLED',
            `Order request cancelled! Vendor ${currentUserName} has cancelled the pending order request.`
        );
    }

    res.status(200).json({
        success: true,
        data: order,
        message: `Order status updated to ${status}`
    });
});


// @desc    Vendor submits payment details after order is accepted
// @route   PATCH /api/orders/:id/payment
// @access  Private (Vendor only)
const submitPayment = asyncHandler(async (req, res) => {
    const { method, upiRef, note } = req.body;

    if (!method) {
        throw new ErrorResponse('Payment method is required', 400);
    }
    const validMethods = ['UPI', 'Cash', 'Bank Transfer', 'Cheque'];
    if (!validMethods.includes(method)) {
        throw new ErrorResponse('Invalid payment method', 400);
    }

    const order = await OrderRequest.findById(req.params.id);
    if (!order) throw new ErrorResponse('Order not found', 404);

    // Only vendor of this order can submit payment
    if (order.vendor.toString() !== req.user.id) {
        throw new ErrorResponse('Not authorized', 403);
    }

    // Payment only makes sense on Accepted orders
    if (order.status !== 'Accepted') {
        throw new ErrorResponse('Payment can only be submitted for accepted orders', 400);
    }

    // Prevent re-submission if already verified
    if (order.payment?.status === 'Verified') {
        throw new ErrorResponse('Payment already verified by farmer', 400);
    }

    const amount = order.requestedQuantity * order.offeredPrice;

    // Fetch or create Vendor's bank account
    let vendorAccount = await MockBankAccount.findOne({ user: req.user.id });
    if (!vendorAccount) {
        const vendorUser = await User.findById(req.user.id);
        if (!vendorUser) {
            throw new ErrorResponse('Vendor user not found', 404);
        }
        const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
        vendorAccount = await MockBankAccount.create({
            user: req.user.id,
            accountHolderName: vendorUser.name,
            accountNumber: `AGRI${randomDigits}`,
            balance: 100000
        });
    }

    // Check balance
    if (vendorAccount.balance < amount) {
        throw new ErrorResponse(`Insufficient mock bank balance. Required: ₹${amount.toLocaleString('en-IN')}, available: ₹${vendorAccount.balance.toLocaleString('en-IN')}. Please top up your bank account.`, 400);
    }

    // Deduct balance
    vendorAccount.balance -= amount;
    await vendorAccount.save();

    // Create a Completed PAYMENT transaction (debit from Vendor, credited on verify)
    await BankTransaction.create({
        sender: req.user.id,
        receiver: order.farmer,
        order: order._id,
        amount,
        type: 'PAYMENT',
        status: 'Completed',
        description: `Mock payment for order #${order._id.toString().slice(-6).toUpperCase()}`
    });

    order.payment = {
        amount,
        method,
        upiRef:  upiRef  || '',
        note:    note    || '',
        status:  'Submitted',
        paidAt:  new Date(),
    };
    await order.save();

    // Notify farmer
    const vendorUser = await User.findById(req.user.id).select('name');
    const vendorName = vendorUser ? vendorUser.name : 'Vendor';
    await createNotification(
        order.farmer,
        req.user.id,
        order._id,
        'PAYMENT_SUBMITTED',
        `💳 Payment submitted! ${vendorName} has submitted ₹${amount.toLocaleString('en-IN')} via ${method}. Please verify and confirm.`
    );

    res.status(200).json({
        success: true,
        data: order,
        message: 'Payment submitted successfully. Farmer will verify shortly.'
    });
});

// @desc    Farmer verifies or rejects submitted payment
// @route   PATCH /api/orders/:id/payment/verify
// @access  Private (Farmer only)
const verifyPayment = asyncHandler(async (req, res) => {
    const { action } = req.body; // 'confirm' | 'reject'

    if (!['confirm', 'reject'].includes(action)) {
        throw new ErrorResponse('Action must be "confirm" or "reject"', 400);
    }

    const order = await OrderRequest.findById(req.params.id);
    if (!order) throw new ErrorResponse('Order not found', 404);

    // Only farmer of this order can verify
    if (order.farmer.toString() !== req.user.id) {
        throw new ErrorResponse('Not authorized', 403);
    }

    if (order.status !== 'Accepted') {
        throw new ErrorResponse('Payment verification only allowed on accepted orders', 400);
    }

    if (order.payment?.status !== 'Submitted') {
        throw new ErrorResponse('No submitted payment found to verify', 400);
    }

    const farmerUser = await User.findById(req.user.id).select('name');
    const farmerName = farmerUser ? farmerUser.name : 'Farmer';
    const amount = order.payment.amount || (order.requestedQuantity * order.offeredPrice);

    if (action === 'confirm') {
        // Fetch or create Farmer's bank account
        let farmerAccount = await MockBankAccount.findOne({ user: req.user.id });
        if (!farmerAccount) {
            const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
            farmerAccount = await MockBankAccount.create({
                user: req.user.id,
                accountHolderName: farmerName,
                accountNumber: `AGRI${randomDigits}`,
                balance: 0
            });
        }

        // Credit to Farmer
        farmerAccount.balance += amount;
        await farmerAccount.save();

        order.payment.status = 'Verified';
        order.payment.verifiedAt = new Date();
        await order.save();

        await createNotification(
            order.vendor,
            req.user.id,
            order._id,
            'PAYMENT_VERIFIED',
            `✅ Payment confirmed! ${farmerName} has verified your ₹${amount.toLocaleString('en-IN')} payment. Proceed to pickup with the OTP.`
        );

        return res.status(200).json({
            success: true,
            data: order,
            message: 'Payment verified. Vendor can now proceed to pickup.'
        });
    }

    // action === 'reject'
    // Refund Vendor
    let vendorAccount = await MockBankAccount.findOne({ user: order.vendor });
    if (vendorAccount) {
        vendorAccount.balance += amount;
        await vendorAccount.save();
    }

    // Log the refund transaction
    await BankTransaction.create({
        sender: req.user.id, // Farmer refunds
        receiver: order.vendor, // Vendor gets refund
        order: order._id,
        amount,
        type: 'REFUND',
        status: 'Completed',
        description: `Refund for rejected payment of order #${order._id.toString().slice(-6).toUpperCase()}`
    });

    order.payment.status = 'Unpaid';
    order.payment.paidAt = undefined;
    await order.save();

    await createNotification(
        order.vendor,
        req.user.id,
        order._id,
        'PAYMENT_REJECTED',
        `❌ Payment not confirmed. ${farmerName} could not verify your payment. Funds have been refunded to your bank account. Please recheck and resubmit.`
    );

    res.status(200).json({
        success: true,
        data: order,
        message: 'Payment rejected. Vendor must resubmit.'
    });
});

module.exports = {
    createOrderRequest,
    getOrders,
    updateOrderStatus,
    submitPayment,
    verifyPayment,
};

