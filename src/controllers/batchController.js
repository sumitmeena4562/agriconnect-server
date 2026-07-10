const OrderRequest = require('../models/OrderRequest');
const DeliveryBatch = require('../models/DeliveryBatch');
const Driver = require('../models/Driver');
const FarmerProfile = require('../models/FarmerProfile');
const VendorProfile = require('../models/VendorProfile');
const User = require('../models/User');
const { createNotification } = require('./notificationController');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// ── Haversine Proximity Helper ──────────────────────────────────────────────
const haversineKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // Earth radius
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── Route Optimization Helper (Nearest Neighbor TSP) ───────────────────────
/**
 * Optimizes the route by sorting all pickups first, then all deliveries,
 * ensuring driver doesn't deliver before picking up.
 */
const optimizeStops = (orders, startLat = 28.6139, startLng = 77.2090) => {
    let pickups = orders.map(o => ({
        orderId: o._id,
        stopType: 'pickup',
        coordinates: o.farmerCoordinates,
        address: o.farmerAddress || `${o.farmer?.name || 'Farmer'}'s Farm`
    }));

    let deliveries = orders.map(o => ({
        orderId: o._id,
        stopType: 'delivery',
        coordinates: o.vendorCoordinates,
        address: o.crop?.location || 'Vendor Location'
    }));

    const optimized = [];
    let currentLat = startLat;
    let currentLng = startLng;
    let seq = 1;

    // 1. Optimize Pickups
    while (pickups.length > 0) {
        let nearestIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < pickups.length; i++) {
            const d = haversineKm(currentLat, currentLng, pickups[i].coordinates.lat, pickups[i].coordinates.lng);
            if (d < minDist) {
                minDist = d;
                nearestIdx = i;
            }
        }
        const stop = pickups.splice(nearestIdx, 1)[0];
        optimized.push({ ...stop, sequence: seq++ });
        currentLat = stop.coordinates.lat;
        currentLng = stop.coordinates.lng;
    }

    // 2. Optimize Deliveries (starting from last pickup stop)
    while (deliveries.length > 0) {
        let nearestIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < deliveries.length; i++) {
            const d = haversineKm(currentLat, currentLng, deliveries[i].coordinates.lat, deliveries[i].coordinates.lng);
            if (d < minDist) {
                minDist = d;
                nearestIdx = i;
            }
        }
        const stop = deliveries.splice(nearestIdx, 1)[0];
        optimized.push({ ...stop, sequence: seq++ });
        currentLat = stop.coordinates.lat;
        currentLng = stop.coordinates.lng;
    }

    // Calculate total route distance
    let totalDist = 0;
    for (let i = 0; i < optimized.length - 1; i++) {
        totalDist += haversineKm(
            optimized[i].coordinates.lat, optimized[i].coordinates.lng,
            optimized[i + 1].coordinates.lat, optimized[i + 1].coordinates.lng
        );
    }

    return { route: optimized, totalDistance: Math.round(totalDist * 10) / 10 };
};

// ── Controller Handlers ─────────────────────────────────────────────────────

// @desc    Auto group accepted orders into delivery batches based on radius
// @route   POST /api/batches/auto-group
// @access  Private (Farmer / Admin)
const autoGroupOrders = asyncHandler(async (req, res) => {
    // Find accepted orders with deliveryStatus Pending and no batch assigned
    const orders = await OrderRequest.find({
        status: 'Accepted',
        deliveryStatus: 'Pending',
        deliveryBatchId: null
    }).populate('farmer').populate('vendor').populate('crop');

    if (orders.length === 0) {
        return res.status(200).json({ success: true, message: 'No orders available for batching', data: [] });
    }

    // Enrich orders with coordinates
    const enrichedOrders = await Promise.all(orders.map(async (order) => {
        const orderObj = order.toObject();
        const farmerProfile = await FarmerProfile.findOne({ user: order.farmer._id });
        const vendorProfile = await VendorProfile.findOne({ user: order.vendor._id });
        
        // Prioritize crop-specific coordinates, fallback to profile coordinates, fallback to default Indore coordinates
        orderObj.farmerCoordinates = order.crop?.coordinates || farmerProfile?.location?.coordinates || { lat: 22.7196, lng: 75.8577 };
        orderObj.vendorCoordinates = vendorProfile?.coordinates || vendorProfile?.location?.coordinates || { lat: 28.61, lng: 77.20 };
        orderObj.farmerAddress = order.crop?.location || farmerProfile?.location?.address || 'Farmer Farm';
        return orderObj;
    }));

    const BATCH_RADIUS_KM = 10;
    const maxBatchSize = 20; // Default max size (can be refined when assigning driver)
    const batchesCreated = [];
    const usedOrderIds = new Set();

    for (let i = 0; i < enrichedOrders.length; i++) {
        const currentOrder = enrichedOrders[i];
        if (usedOrderIds.has(currentOrder._id.toString())) continue;

        const currentBatchOrders = [currentOrder];
        usedOrderIds.add(currentOrder._id.toString());

        // Find nearby orders
        for (let j = i + 1; j < enrichedOrders.length; j++) {
            if (currentBatchOrders.length >= maxBatchSize) break;
            const targetOrder = enrichedOrders[j];
            if (usedOrderIds.has(targetOrder._id.toString())) continue;

            const dist = haversineKm(
                currentOrder.farmerCoordinates.lat, currentOrder.farmerCoordinates.lng,
                targetOrder.farmerCoordinates.lat, targetOrder.farmerCoordinates.lng
            );

            if (dist <= BATCH_RADIUS_KM) {
                currentBatchOrders.push(targetOrder);
                usedOrderIds.add(targetOrder._id.toString());
            }
        }

        // Optimize route for the current batch
        const startLat = currentOrder.farmerCoordinates.lat;
        const startLng = currentOrder.farmerCoordinates.lng;
        const { route, totalDistance } = optimizeStops(currentBatchOrders, startLat, startLng);

        // Save DeliveryBatch
        const batch = await DeliveryBatch.create({
            orders: currentBatchOrders.map(o => o._id),
            optimizedRoute: route,
            totalDistance,
            batchStatus: 'Batch Created'
        });

        // Update orders status
        await OrderRequest.updateMany(
            { _id: { $in: currentBatchOrders.map(o => o._id) } },
            { deliveryBatchId: batch._id, deliveryStatus: 'Batch Created' }
        );

        batchesCreated.push(batch);
    }

    res.status(201).json({
        success: true,
        message: `Successfully created ${batchesCreated.length} batches.`,
        data: batchesCreated
    });
});

// @desc    Assign a driver to a delivery batch
// @route   POST /api/batches/:id/assign-driver
// @access  Private (Farmer / Admin)
const assignDriverToBatch = asyncHandler(async (req, res) => {
    const { driverId } = req.body;
    if (!driverId) throw new ErrorResponse('Please specify a driverId', 400);

    const batch = await DeliveryBatch.findById(req.params.id);
    if (!batch) throw new ErrorResponse('Batch not found', 404);

    const driver = await Driver.findById(driverId);
    if (!driver) throw new ErrorResponse('Driver not found', 404);

    if (driver.status === 'On Delivery') {
        throw new ErrorResponse('Driver is currently on another delivery task', 400);
    }

    // Vehicle capacity validations
    const orderCount = batch.orders.length;
    const capacityLimit = driver.vehicleType === 'Bike' ? 5 : 20;

    if (orderCount > capacityLimit) {
        throw new ErrorResponse(
            `Driver is on a ${driver.vehicleType} (Max ${capacityLimit} orders). This batch has ${orderCount} orders.`, 
            400
        );
    }

    // Assign driver to batch
    batch.driver = driver._id;
    batch.batchStatus = 'Driver Assigned';
    await batch.save();

    // Update all orders in batch
    await OrderRequest.updateMany(
        { _id: { $in: batch.orders } },
        { driver: driver._id, deliveryStatus: 'Driver Assigned' }
    );

    // Update driver status
    driver.status = 'On Delivery';
    await driver.save();

    // Notify all vendors in the batch
    const orderRequests = await OrderRequest.find({ _id: { $in: batch.orders } });
    await Promise.all(orderRequests.map(async (order) => {
        await createNotification(
            order.vendor,
            req.user.id,
            order._id,
            'ORDER_UPDATED',
            `🚚 Driver ${driver.name} has been assigned to deliver your order in a batch shipment.`
        );
    }));

    res.json({
        success: true,
        message: 'Driver successfully assigned to delivery batch',
        data: batch
    });
});

// @desc    Get active batch for driver
// @route   GET /api/batches/driver/active
// @access  Private
const getActiveBatchForDriver = asyncHandler(async (req, res) => {
    // Find driver profile for logged in user (Driver or Farmer Fleet User)
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) throw new ErrorResponse('Driver profile not found', 404);

    const batch = await DeliveryBatch.findOne({
        driver: driver._id,
        batchStatus: { $in: ['Driver Assigned', 'Out For Delivery', 'Partially Delivered'] }
    }).populate({
        path: 'orders',
        populate: [
            { path: 'crop', select: 'name unit price' },
            { path: 'farmer', select: 'name phone' },
            { path: 'vendor', select: 'name phone' }
        ]
    });

    if (!batch) {
        return res.json({ success: true, message: 'No active delivery batch', data: null });
    }

    res.json({ success: true, data: batch });
});

// @desc    Update batch status (e.g. Out For Delivery)
// @route   PATCH /api/batches/:id/status
// @access  Private
const updateBatchStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowedStatuses = ['Out For Delivery', 'Completed'];

    if (!allowedStatuses.includes(status)) {
        throw new ErrorResponse('Invalid status update for batch', 400);
    }

    const batch = await DeliveryBatch.findById(req.params.id);
    if (!batch) throw new ErrorResponse('Batch not found', 404);

    batch.batchStatus = status;
    await batch.save();

    // Update all orders in batch
    await OrderRequest.updateMany(
        { _id: { $in: batch.orders } },
        { deliveryStatus: status }
    );

    res.json({ success: true, message: `Batch status updated to ${status}`, data: batch });
});

// @desc    Deliver individual order in batch via OTP verification
// @route   PATCH /api/batches/:id/orders/:orderId/deliver
// @access  Private
const deliverOrderInBatch = asyncHandler(async (req, res) => {
    const { otp } = req.body;
    const { id: batchId, orderId } = req.params;

    if (!otp) throw new ErrorResponse('Please provide the handover OTP', 400);

    const batch = await DeliveryBatch.findById(batchId);
    if (!batch) throw new ErrorResponse('Batch not found', 404);

    const order = await OrderRequest.findById(orderId);
    if (!order) throw new ErrorResponse('Order not found', 404);

    // Verify OTP
    if (order.deliveryOTP !== otp) {
        throw new ErrorResponse('Invalid delivery OTP', 400);
    }

    // Complete order
    order.deliveryStatus = 'Completed';
    order.status = 'Completed';
    await order.save();

    // Check batch status progression
    const allOrders = await OrderRequest.find({ _id: { $in: batch.orders } });
    const completedCount = allOrders.filter(o => o.deliveryStatus === 'Completed').length;

    if (completedCount === allOrders.length) {
        batch.batchStatus = 'Completed';
        // Mark driver status back to idle
        if (batch.driver) {
            await Driver.findByIdAndUpdate(batch.driver, { status: 'Available' });
        }
    } else {
        batch.batchStatus = 'Partially Delivered';
    }
    await batch.save();

    // Notify vendor
    await createNotification(
        order.vendor,
        order.farmer,
        order._id,
        'ORDER_UPDATED',
        `🎉 Delivery complete! Your order has been delivered successfully by batch dispatch.`
    );

    res.json({
        success: true,
        message: `Order #${orderId.slice(-6).toUpperCase()} delivered successfully.`,
        batchStatus: batch.batchStatus
    });
});

// @desc    Get all batches
// @route   GET /api/batches
// @access  Private
const getAllBatches = asyncHandler(async (req, res) => {
    const batches = await DeliveryBatch.find()
        .populate('driver')
        .populate({
            path: 'orders',
            populate: [
                { path: 'crop', select: 'name unit price' },
                { path: 'farmer', select: 'name phone' },
                { path: 'vendor', select: 'name phone' }
            ]
        })
        .sort({ createdAt: -1 });

    res.json({ success: true, data: batches });
});

module.exports = {
    autoGroupOrders,
    assignDriverToBatch,
    getActiveBatchForDriver,
    updateBatchStatus,
    deliverOrderInBatch,
    getAllBatches
};
