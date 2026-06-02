const OrderRequest = require('../models/OrderRequest');
const Crop = require('../models/Crop');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Send an order request to a farmer
// @route   POST /api/orders
// @access  Private (Vendor only)
const createOrderRequest = asyncHandler(async (req, res) => {
    const { cropId, requestedQuantity, offeredPrice, message } = req.body;

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
        message
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

    // If Farmer, show requests received. If Vendor, show requests sent.
    if (req.user.role === 'FARMER') {
        query.farmer = req.user.id;
    } else if (req.user.role === 'VENDOR') {
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

    if (req.user.role === 'VENDOR' && order.vendor.toString() !== req.user.id) {
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

    // A Vendor can only Cancel. A Farmer can Accept/Reject/Complete.
    if (req.user.role === 'VENDOR' && status !== 'Cancelled') {
        throw new ErrorResponse('Vendors can only cancel an order', 400);
    }

    if (req.user.role === 'FARMER' && status === 'Cancelled') {
        throw new ErrorResponse('Farmers cannot cancel an order', 400);
    }

    // If transitioned to Accepted, decrement available quantity from the Crop
    if (status === 'Accepted' && order.status !== 'Accepted') {
        const crop = await Crop.findById(order.crop);
        if (!crop) {
            throw new ErrorResponse('Associated crop not found', 404);
        }
        if (crop.quantity < order.requestedQuantity) {
            throw new ErrorResponse(`Insufficient crop quantity. Only ${crop.quantity} ${crop.unit} available.`, 400);
        }
        
        crop.quantity -= order.requestedQuantity;
        if (crop.quantity === 0) {
            crop.status = 'Sold Out';
        }
        await crop.save();
    }

    order.status = status;
    await order.save();

    // If Accepted, we might want to decrease available quantity from Crop?
    // Usually, we only decrease it when Completed, or we set crop status to 'Sold Out' if quantity reaches 0.
    // For now, just updating the request status.

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
