const OrderRequest = require('../models/OrderRequest');
const Crop = require('../models/Crop');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

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

    // Optional status filter
    if (req.query.status) {
        query.status = req.query.status;
    }

    const orders = await OrderRequest.find(query)
        .populate('crop', 'name category price unit images')
        .populate('farmer', 'name phone location')
        .populate('vendor', 'name phone')
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        count: orders.length,
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
        const expectedOTP = order.deliveryOTP || '0000';
        if (expectedOTP !== otp.toString().trim()) {
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

    res.status(200).json({
        success: true,
        data: order,
        message: `Order status updated to ${status}`
    });
});

module.exports = {
    createOrderRequest,
    getOrders,
    updateOrderStatus
};
