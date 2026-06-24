const OrderRequest = require('../models/OrderRequest');
const Crop = require('../models/Crop');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const User = require('../models/User');
const MockBankAccount = require('../models/MockBankAccount');
const BankTransaction = require('../models/BankTransaction');
const { createNotification } = require('./notificationController');
const sseManager = require('../utils/sseManager');

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
    await orderRequest.populate('crop', 'name category price unit images variety logisticsOption paymentTerms');
    await orderRequest.populate('farmer', 'name phone location');
    await orderRequest.populate('vendor', 'name phone');

    // Broadcast new order to the farmer
    sseManager.sendToUser(orderRequest.farmer, 'ORDER_UPDATED', orderRequest);

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
            .populate('crop', 'name category price unit images variety logisticsOption paymentTerms')
            .populate('farmer', 'name phone location')
            .populate('vendor', 'name phone')
            .populate('driver', 'name phone vehicleNumber vehicleType')
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

    // If transitioned to Completed, verify delivery OTP and payment verification
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
        if (!order.payment || order.payment.status !== 'Verified') {
            throw new ErrorResponse('Payment must be verified by the farmer before the order can be completed', 400);
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

        // Auto-verify if Cash on Delivery (COD)
        if (crop.paymentTerms === 'Cash on Delivery') {
            order.payment = {
                amount: 0,
                method: 'Cash',
                upiRef: '',
                status: 'Verified',
                note: 'Cash on Delivery - no advance required',
                verifiedAt: new Date()
            };
        }
    }

    order.status = status;
    await order.save();

    // Release driver if assigned and completed/cancelled
    if ((status === 'Completed' || status === 'Cancelled' || status === 'Rejected') && order.driver) {
        const Driver = require('../models/Driver');
        await Driver.findByIdAndUpdate(order.driver, { status: 'Available' });
    }

    // Log offline cash ledger entries upon completion
    if (status === 'Completed') {
        const crop = await Crop.findById(order.crop);
        if (crop) {
            const totalCost = order.requestedQuantity * order.offeredPrice;
            if (crop.paymentTerms === 'Cash on Delivery') {
                await BankTransaction.create({
                    sender: order.vendor,
                    receiver: order.farmer,
                    order: order._id,
                    amount: totalCost,
                    type: 'PAYMENT',
                    status: 'Completed',
                    description: `Cash on Delivery (Offline) for order #${order._id.toString().slice(-6).toUpperCase()}`
                });
            } else if (crop.paymentTerms === '50% Advance') {
                const remainingAmount = 0.5 * totalCost;
                await BankTransaction.create({
                    sender: order.vendor,
                    receiver: order.farmer,
                    order: order._id,
                    amount: remainingAmount,
                    type: 'PAYMENT',
                    status: 'Completed',
                    description: `Offline Cash Payment (Remaining 50%) for order #${order._id.toString().slice(-6).toUpperCase()}`
                });
            }
        }
    }

    // Broadcast order status changes in real-time
    await order.populate([
        { path: 'crop', select: 'name category price unit images variety location logisticsOption paymentTerms' },
        { path: 'farmer', select: 'name phone location' },
        { path: 'vendor', select: 'name phone' }
    ]);
    sseManager.sendToUser(order.vendor, 'ORDER_UPDATED', order);
    sseManager.sendToUser(order.farmer, 'ORDER_UPDATED', order);

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

    const crop = await Crop.findById(order.crop);
    if (!crop) {
        throw new ErrorResponse('Associated crop not found', 404);
    }

    if (crop.paymentTerms === 'Cash on Delivery') {
        throw new ErrorResponse('This order is Cash on Delivery, no advance payment needed', 400);
    }

    const totalAmount = order.requestedQuantity * order.offeredPrice;
    let amount = totalAmount;
    if (crop.paymentTerms === '50% Advance') {
        amount = 0.5 * totalAmount;
    }

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

    // Broadcast payment submission in real-time
    await order.populate([
        { path: 'crop', select: 'name category price unit images variety location logisticsOption paymentTerms' },
        { path: 'farmer', select: 'name phone location' },
        { path: 'vendor', select: 'name phone' }
    ]);
    sseManager.sendToUser(order.vendor, 'ORDER_UPDATED', order);
    sseManager.sendToUser(order.farmer, 'ORDER_UPDATED', order);

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

        // Broadcast payment verification to both parties
        await order.populate([
            { path: 'crop', select: 'name category price unit images variety location logisticsOption paymentTerms' },
            { path: 'farmer', select: 'name phone location' },
            { path: 'vendor', select: 'name phone' }
        ]);
        sseManager.sendToUser(order.vendor, 'ORDER_UPDATED', order);
        sseManager.sendToUser(order.farmer, 'ORDER_UPDATED', order);

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

    // Broadcast payment rejection to both parties
    await order.populate([
        { path: 'crop', select: 'name category price unit images variety location logisticsOption paymentTerms' },
        { path: 'farmer', select: 'name phone location' },
        { path: 'vendor', select: 'name phone' }
    ]);
    sseManager.sendToUser(order.vendor, 'ORDER_UPDATED', order);
    sseManager.sendToUser(order.farmer, 'ORDER_UPDATED', order);

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

// @desc    Farmer assigns a driver and dispatches the order (In Transit)
// @route   PATCH /api/orders/:id/dispatch
// @access  Private (Farmer only)
const dispatchOrder = asyncHandler(async (req, res) => {
    const { driverId } = req.body;

    if (!driverId) {
        throw new ErrorResponse('Please assign a driver for dispatch', 400);
    }

    const order = await OrderRequest.findById(req.params.id);
    if (!order) throw new ErrorResponse('Order request not found', 404);

    // Only authorized farmer of this order
    if (order.farmer.toString() !== req.user.id) {
        throw new ErrorResponse('Not authorized to dispatch this order', 403);
    }

    if (order.status !== 'Accepted') {
        throw new ErrorResponse('Only accepted orders can be dispatched', 400);
    }

    if (order.deliveryStatus === 'In Transit') {
        throw new ErrorResponse('Order is already in transit', 400);
    }

    if (driverId === 'self') {
        order.driver = null;
        order.dispatchTime = new Date();
        order.deliveryStatus = 'In Transit';
        await order.save();

        // Broadcast SSE update
        await order.populate([
            { path: 'crop', select: 'name category price unit images variety location logisticsOption paymentTerms' },
            { path: 'farmer', select: 'name phone location' },
            { path: 'vendor', select: 'name phone' }
        ]);
        sseManager.sendToUser(order.vendor, 'ORDER_UPDATED', order);
        sseManager.sendToUser(order.farmer, 'ORDER_UPDATED', order);

        // Create Notification for vendor
        const User = require('../models/User');
        const farmerUser = await User.findById(req.user.id).select('name');
        const farmerName = farmerUser ? farmerUser.name : 'Farmer';
        await createNotification(
            order.vendor,
            req.user.id,
            order._id,
            'ORDER_ACCEPTED',
            `🚚 Order dispatched! Farmer ${farmerName} is delivering the crops directly (Self-Delivery).`
        );

        return res.status(200).json({
            success: true,
            data: order,
            message: 'Order dispatched successfully via Self-Delivery.'
        });
    }

    const Driver = require('../models/Driver');
    const driver = await Driver.findById(driverId);
    if (!driver) throw new ErrorResponse('Driver not found', 404);

    if (driver.farmer.toString() !== req.user.id) {
        throw new ErrorResponse('Driver does not belong to your fleet', 403);
    }

    if (driver.status === 'On Delivery') {
        throw new ErrorResponse('Driver is currently on another delivery', 400);
    }

    // Assign driver and set In Transit status
    order.driver = driver._id;
    order.dispatchTime = new Date();
    order.deliveryStatus = 'In Transit';
    await order.save();

    // Mark driver status as busy
    driver.status = 'On Delivery';
    await driver.save();

    // Broadcast SSE update
    await order.populate([
        { path: 'crop', select: 'name category price unit images variety location logisticsOption paymentTerms' },
        { path: 'farmer', select: 'name phone location' },
        { path: 'vendor', select: 'name phone' },
        { path: 'driver', select: 'name phone vehicleNumber vehicleType' }
    ]);
    sseManager.sendToUser(order.vendor, 'ORDER_UPDATED', order);
    sseManager.sendToUser(order.farmer, 'ORDER_UPDATED', order);

    // Create Notification for vendor
    const User = require('../models/User');
    const farmerUser = await User.findById(req.user.id).select('name');
    const farmerName = farmerUser ? farmerUser.name : 'Farmer';
    await createNotification(
        order.vendor,
        req.user.id,
        order._id,
        'ORDER_ACCEPTED', // Reuse accepted event
        `🚚 Order dispatched! Farmer ${farmerName} has dispatched driver ${driver.name} (${driver.vehicleType} - ${driver.vehicleNumber}) with your crops.`
    );

    res.status(200).json({
        success: true,
        data: order,
        message: 'Order dispatched successfully and driver is on their way.'
    });
});

// Helper to fetch actual driving route from OSRM
const fetchOmsrRoute = async (startLat, startLng, endLat, endLng) => {
    try {
        const url = `https://router.projectosrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
        const response = await fetch(url, { 
            headers: { 'User-Agent': 'AgriConnectApp/1.0' } 
        });
        if (!response.ok) {
            throw new Error(`OSRM responded with status ${response.status}`);
        }
        const data = await response.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const geojsonCoords = data.routes[0].geometry.coordinates;
            // Map [lng, lat] to [lat, lng] for Leaflet
            return geojsonCoords.map(coord => [coord[1], coord[0]]);
        }
    } catch (error) {
        console.error('OSRM route fetch failed, using fallback simulated path:', error.message);
    }
    return null;
};

// @desc    Get live delivery tracking status (Coordinates and ETA)
// @route   GET /api/orders/:id/tracking
// @access  Private
const getLiveTracking = asyncHandler(async (req, res) => {
    const order = await OrderRequest.findById(req.params.id).populate('driver');
    if (!order) throw new ErrorResponse('Order not found', 404);

    // Verify user is farmer or vendor of this order
    if (order.farmer.toString() !== req.user.id && order.vendor.toString() !== req.user.id) {
        throw new ErrorResponse('Not authorized to track this order', 403);
    }

    if (order.deliveryStatus !== 'In Transit' && order.deliveryStatus !== 'Arrived' && order.deliveryStatus !== 'Completed') {
        return res.status(200).json({
            success: true,
            deliveryStatus: order.deliveryStatus,
            message: 'Order is not currently in transit'
        });
    }

    // Deterministic Start and End coordinates based on order ID to simulate route
    const id = order._id.toString();
    const seed1 = id.charCodeAt(id.length - 1) || 0;
    const seed2 = id.charCodeAt(id.length - 2) || 0;
    const seed3 = id.charCodeAt(id.length - 3) || 0;
    const seed4 = id.charCodeAt(id.length - 4) || 0;

    const startLat = 28.42 + (seed1 % 10) / 100;
    const startLng = 77.01 + (seed2 % 10) / 100;
    const endLat = 28.61 + (seed3 % 10) / 100;
    const endLng = 77.20 + (seed4 % 10) / 100;

    // Total simulation transit time: 3 minutes (180 seconds)
    const TRANSIT_DURATION = 180; 
    const dispatchTime = order.dispatchTime ? new Date(order.dispatchTime).getTime() : Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - dispatchTime) / 1000));
    
    // Fetch driving coordinates from OSRM
    let routePoints = await fetchOmsrRoute(startLat, startLng, endLat, endLng);

    // Fallback to sine-wave simulated route if OSRM fails
    if (!routePoints || routePoints.length === 0) {
        routePoints = [];
        const NUM_POINTS = 30;
        for (let i = 0; i <= NUM_POINTS; i++) {
            const t = i / NUM_POINTS;
            const lat = startLat + (endLat - startLat) * t + 0.02 * Math.sin(t * Math.PI);
            const lng = startLng + (endLng - startLng) * t;
            routePoints.push([lat, lng]);
        }
    }

    let currentCoords;
    let etaSeconds = 0;
    let status = order.deliveryStatus;
    const numPoints = routePoints.length - 1;

    if (elapsedSeconds >= TRANSIT_DURATION) {
        currentCoords = routePoints[numPoints];
        etaSeconds = 0;
        status = 'Arrived';
        if (order.deliveryStatus === 'In Transit') {
            order.deliveryStatus = 'Arrived';
            await order.save();
        }
    } else {
        const progress = elapsedSeconds / TRANSIT_DURATION;
        const index = Math.min(numPoints, Math.floor(progress * routePoints.length));
        currentCoords = routePoints[index] || routePoints[0];
        etaSeconds = TRANSIT_DURATION - elapsedSeconds;
    }

    res.status(200).json({
        success: true,
        deliveryStatus: status,
        startCoords: [startLat, startLng],
        endCoords: [endLat, endLng],
        currentCoords,
        etaSeconds,
        route: routePoints,
        dispatchTime: order.dispatchTime,
        driver: order.driver ? {
            name: order.driver.name,
            phone: order.driver.phone,
            vehicleNumber: order.driver.vehicleNumber,
            vehicleType: order.driver.vehicleType
        } : null
    });
});

module.exports = {
    createOrderRequest,
    getOrders,
    updateOrderStatus,
    submitPayment,
    verifyPayment,
    dispatchOrder,
    getLiveTracking
};

