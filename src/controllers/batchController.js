const OrderRequest = require('../models/OrderRequest');
const DeliveryBatch = require('../models/DeliveryBatch');
const Driver = require('../models/Driver');
const FarmerProfile = require('../models/FarmerProfile');
const VendorProfile = require('../models/VendorProfile');
const User = require('../models/User');
const VehicleType = require('../models/VehicleType');
const bcrypt = require('bcryptjs'); // for OTP hashing
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
        address: o.vendorAddress || `${o.vendor?.name || 'Vendor'}'s Shop`
    }));

    const optimized = [];
    let currentLat = startLat;
    let currentLng = startLng;
    let seq = 1;
    let totalDistance = 0;

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
        totalDistance += minDist;
        optimized.push({ ...stop, sequence: seq++, loadingSequence: null }); // Pickups: no loading order needed
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
        totalDistance += minDist;
        optimized.push({ ...stop, sequence: seq++ });
        currentLat = stop.coordinates.lat;
        currentLng = stop.coordinates.lng;
    }

    // 3. Assign LIFO loadingSequence to delivery stops only
    // LOGIC: seq=1 (nearest, 1st to deliver) → loaded LAST on truck → loadingSequence = totalDeliveries
    //        seq=N (farthest, last to deliver) → loaded FIRST on truck → loadingSequence = 1
    const deliveryStopsInRoute = optimized.filter(s => s.stopType === 'delivery');
    const totalDeliveries = deliveryStopsInRoute.length;
    deliveryStopsInRoute.forEach((stop, idx) => {
        stop.loadingSequence = totalDeliveries - idx;
    });

    return { route: optimized, totalDistance: Math.round(totalDistance * 10) / 10 };
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

    // ── Fix: Eliminate N+1 — bulk-load all FarmerProfiles + VendorProfiles in ONE query each ─
    const farmerUserIds = [...new Set(orders.map(o => String(o.farmer._id)))];
    const vendorUserIds = [...new Set(orders.map(o => String(o.vendor._id)))];

    const [farmerProfiles, vendorProfiles] = await Promise.all([
        FarmerProfile.find({ user: { $in: farmerUserIds } }),
        VendorProfile.find({ user: { $in: vendorUserIds } })
    ]);

    // Build lookup maps for O(1) access
    const farmerProfileMap = Object.fromEntries(farmerProfiles.map(fp => [String(fp.user), fp]));
    const vendorProfileMap = Object.fromEntries(vendorProfiles.map(vp => [String(vp.user), vp]));

    // Enrich orders with coordinates (no DB calls in loop)
    const enrichedOrders = orders.map(order => {
        const orderObj = order.toObject();
        const farmerProfile = farmerProfileMap[String(order.farmer._id)];
        const vendorProfile = vendorProfileMap[String(order.vendor._id)];

        // Prioritize crop-specific coordinates, fallback to profile coordinates, fallback to default Indore coordinates
        orderObj.farmerCoordinates = order.crop?.coordinates || farmerProfile?.location?.coordinates || { lat: 22.7196, lng: 75.8577 };
        orderObj.vendorCoordinates = vendorProfile?.coordinates || vendorProfile?.location?.coordinates || { lat: 28.61, lng: 77.20 };
        orderObj.farmerAddress = order.crop?.location || farmerProfile?.location?.address || 'Farmer Farm';
        orderObj.vendorAddress = vendorProfile?.godownAddress || `${vendorProfile?.businessName || order.vendor?.name || 'Vendor'}'s Shop`;
        return orderObj;
    });

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

        // Save DeliveryBatch — include farmerOwner for ownership filtering
        const batch = await DeliveryBatch.create({
            orders: currentBatchOrders.map(o => o._id),
            farmerOwner: req.user.id, // ── track which farmer created this batch
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

    // ── Batch status guard: can only assign driver to a 'Batch Created' batch ──
    if (!['Batch Created', 'Driver Assigned'].includes(batch.batchStatus)) {
        throw new ErrorResponse(`Cannot assign driver — batch is already '${batch.batchStatus}'`, 400);
    }

    const driver = await Driver.findById(driverId);
    if (!driver) throw new ErrorResponse('Driver not found', 404);

    // ── Ownership check: driver must belong to the requesting farmer ────────────
    if (String(driver.farmer) !== String(req.user.id)) {
        throw new ErrorResponse('You can only assign your own registered drivers', 403);
    }

    // ── Availability check FIRST — before touching the old driver ────────────
    // IMPORTANT: must check new driver BEFORE freeing old driver to avoid
    // data inconsistency (old driver freed but new driver fails → batch orphaned)
    if (driver.status === 'On Delivery') {
        throw new ErrorResponse('Driver is currently on another delivery task', 400);
    }

    // ── Reassignment guard: free the previous driver only after new driver passes ──
    if (batch.driver && String(batch.driver) !== String(driver._id)) {
        await Driver.findByIdAndUpdate(batch.driver, { status: 'Available' });
    }

    // Vehicle capacity validations
    const orderCount = batch.orders.length;
    const vehicleSpecs = await VehicleType.findOne({ vehicleName: driver.vehicleType });
    const capacityLimit = vehicleSpecs ? vehicleSpecs.maxOrders : (driver.vehicleType === 'Bike' ? 5 : 20);

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
// @route   GET /api/batches/driver/active?driverId=<id>
// @access  Public (driver shares link via URL — no auth account)
// NOTE: Drivers in this system are registered by farmers and have no login account.
//       The DriverBatchConsole page receives driverId from the URL (?driverId=xxx)
//       and passes it as a query param to this endpoint.
const getActiveBatchForDriver = asyncHandler(async (req, res) => {
    const { driverId } = req.query;
    if (!driverId) throw new ErrorResponse('driverId query param is required', 400);

    // Validate ObjectId format to prevent DB cast errors
    if (!driverId.match(/^[a-f\d]{24}$/i)) {
        throw new ErrorResponse('Invalid driverId format', 400);
    }

    const driver = await Driver.findById(driverId);
    if (!driver) throw new ErrorResponse('Driver not found', 404);

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

    // ── Ownership check — only the farmer who owns the batch can change its status
    if (
        req.user.role === 'FARMER' &&
        batch.farmerOwner &&
        String(batch.farmerOwner) !== String(req.user.id)
    ) {
        throw new ErrorResponse('You do not have permission to update this batch', 403);
    }

    // ── State Machine Guard — enforce valid transitions ──────────────────────
    const validTransitions = {
        'Driver Assigned':     ['Out For Delivery'],
        'Out For Delivery':    ['Completed'],
        'Partially Delivered': ['Completed']
    };
    if (!validTransitions[batch.batchStatus]?.includes(status)) {
        const allowed = validTransitions[batch.batchStatus];
        const hint = allowed ? `Allowed next: ${allowed.join(', ')}` : 'No further transitions allowed';
        throw new ErrorResponse(
            `Cannot transition batch from '${batch.batchStatus}' to '${status}'. ${hint}.`,
            400
        );
    }

    batch.batchStatus = status;
    await batch.save();

    // ── Fix C: Record dispatchTime when batch goes Out For Delivery ─────────
    const orderUpdateFields = { deliveryStatus: status };
    if (status === 'Out For Delivery') {
        orderUpdateFields.dispatchTime = new Date();
    }

    // ── Fix B: Free the driver when batch is force-completed via this endpoint
    if (status === 'Completed' && batch.driver) {
        await Driver.findByIdAndUpdate(batch.driver, { status: 'Available' });
    }

    await OrderRequest.updateMany(
        { _id: { $in: batch.orders } },
        orderUpdateFields
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

    // Must explicitly select deliveryOTP since it has select:false in schema
    const order = await OrderRequest.findById(orderId).select('+deliveryOTP');
    if (!order) throw new ErrorResponse('Order not found', 404);

    // ── Fix D: Validate that the order actually belongs to this batch ────────
    const batchOrderIds = batch.orders.map(id => String(id));
    if (!batchOrderIds.includes(String(orderId))) {
        throw new ErrorResponse('This order does not belong to the specified batch', 400);
    }

    // Guard: prevent re-delivering an already completed order
    if (order.deliveryStatus === 'Completed') {
        throw new ErrorResponse('This order has already been delivered', 400);
    }

    // Guard: batch must be Out For Delivery or Partially Delivered
    const deliverableStatuses = ['Out For Delivery', 'Partially Delivered'];
    if (!deliverableStatuses.includes(batch.batchStatus)) {
        throw new ErrorResponse(`Cannot deliver — batch status is '${batch.batchStatus}'. Batch must be dispatched first.`, 400);
    }

    // Guard: OTP format — must be 4–6 digits
    if (!/^\d{4,6}$/.test(otp.toString().trim())) {
        throw new ErrorResponse('OTP must be 4 to 6 digits', 400);
    }

    // Verify OTP — Mongoose getter automatically decrypted it when reading
    const otpValid = order.deliveryOTP === otp.toString().trim();
    if (!otpValid) {
        throw new ErrorResponse('Invalid delivery OTP', 400);
    }

    // Complete order — also clear OTP after use so it cannot be replayed
    order.deliveryStatus = 'Completed';
    order.status = 'Completed';
    order.deliveryOTP = undefined; // ← Fix: clear OTP after successful delivery
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

// @desc    Get all batches with optional pagination and status filter
// @route   GET /api/batches?status=&page=&limit=
// @access  Private
const getAllBatches = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build query — filter by farmer ownership when role is FARMER
    // Use $or to include both: batches owned by this farmer AND legacy batches
    // that were created before the farmerOwner field existed (farmerOwner is null/missing)
    const query = {};
    if (req.user.role === 'FARMER') {
        query.$or = [
            { farmerOwner: req.user.id },
            { farmerOwner: { $exists: false } },
            { farmerOwner: null }
        ];
    }

    // Optionally filter by batchStatus
    if (status) {
        const validStatuses = ['Batch Created', 'Driver Assigned', 'Out For Delivery', 'Partially Delivered', 'Completed'];
        if (!validStatuses.includes(status)) {
            throw new ErrorResponse(`Invalid status filter. Valid values: ${validStatuses.join(', ')}`, 400);
        }
        query.batchStatus = status;
    }

    const [batches, total] = await Promise.all([
        DeliveryBatch.find(query)
            .populate('driver')
            .populate({
                path: 'orders',
                populate: [
                    { path: 'crop', select: 'name unit price' },
                    { path: 'farmer', select: 'name phone' },
                    { path: 'vendor', select: 'name phone' }
                ]
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum),
        DeliveryBatch.countDocuments(query)
    ]);

    res.json({
        success: true,
        pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
        data: batches
    });
});

// @desc    Get single batch by ID (for loading checklist)
// @route   GET /api/batches/:id
// @access  Private
const getBatchById = asyncHandler(async (req, res) => {
    const batch = await DeliveryBatch.findById(req.params.id)
        .populate('driver')
        .populate({
            path: 'orders',
            populate: [
                { path: 'crop', select: 'name unit price images' },
                { path: 'farmer', select: 'name phone' },
                { path: 'vendor', select: 'name phone' }
            ]
        });

    if (!batch) throw new ErrorResponse('Batch not found', 404);

    // Ownership check — only batch owner or admin can view full details
    // Legacy batches (no farmerOwner) are accessible to any authenticated farmer
    if (
        req.user.role === 'FARMER' &&
        batch.farmerOwner &&
        String(batch.farmerOwner) !== String(req.user.id)
    ) {
        throw new ErrorResponse('You do not have access to this batch', 403);
    }

    res.json({ success: true, data: batch });
});

// @desc    Update batch loading/delivery sequences & assignments (Load Planning)
// @route   PUT /api/batches/:id/load-plan
// @access  Private (Farmer / Admin)
const updateBatchLoadPlan = asyncHandler(async (req, res, next) => {
    const { optimizedRoute, orderIdsToRemove } = req.body;
    let batch = await DeliveryBatch.findById(req.params.id);

    if (!batch) {
        return next(new ErrorResponse('Batch not found', 404));
    }

    // ── Fix E: Block load plan edits if batch is already in transit ──────────
    const lockedStatuses = ['Out For Delivery', 'Partially Delivered', 'Completed'];
    if (lockedStatuses.includes(batch.batchStatus)) {
        return next(new ErrorResponse(
            `Cannot modify load plan — batch is already '${batch.batchStatus}'. Only 'Batch Created' or 'Driver Assigned' batches can be edited.`,
            400
        ));
    }

    // Handle order removal if requested
    if (orderIdsToRemove && orderIdsToRemove.length > 0) {
        // Filter out removed orders from batch.orders
        batch.orders = batch.orders.filter(id => !orderIdsToRemove.includes(String(id)));

        // Remove batch/driver references and reset deliveryStatus to Pending
        await OrderRequest.updateMany(
            { _id: { $in: orderIdsToRemove } },
            { 
                $unset: { deliveryBatchId: 1, driver: 1 },
                $set: { deliveryStatus: 'Pending' }
            }
        );

        // If batch becomes empty, delete it
        if (batch.orders.length === 0) {
            await DeliveryBatch.findByIdAndDelete(req.params.id);
            return res.json({ success: true, message: 'Batch deleted because all orders were removed.', data: null });
        }
    }

    // Update optimizedRoute if provided
    if (optimizedRoute) {
        // ── Validate route stops before saving ────────────────────────────────
        if (!Array.isArray(optimizedRoute) || optimizedRoute.length === 0) {
            return next(new ErrorResponse('optimizedRoute must be a non-empty array', 400));
        }
        for (let i = 0; i < optimizedRoute.length; i++) {
            const stop = optimizedRoute[i];
            if (
                !stop.coordinates ||
                typeof stop.coordinates.lat !== 'number' ||
                typeof stop.coordinates.lng !== 'number' ||
                typeof stop.sequence !== 'number'
            ) {
                return next(new ErrorResponse(
                    `Stop at index ${i} is invalid — must have coordinates.lat, coordinates.lng (numbers) and sequence (number)`,
                    400
                ));
            }
        }

        batch.optimizedRoute = optimizedRoute;

        // Recalculate distance along the new route
        let dist = 0;
        for (let i = 0; i < optimizedRoute.length - 1; i++) {
            const current = optimizedRoute[i].coordinates;
            const nextStop = optimizedRoute[i+1].coordinates;
            if (current && nextStop) {
                dist += haversineKm(current.lat, current.lng, nextStop.lat, nextStop.lng);
            }
        }
        batch.totalDistance = Math.round(dist * 10) / 10;
    }

    await batch.save();

    // ── Notify assigned driver if route was updated ──────────────────────────────────
    if (optimizedRoute && batch.driver) {
        const firstOrderId = batch.orders[0];
        await createNotification(
            batch.driver,   // recipient: driver
            req.user.id,    // actor: farmer who changed the plan
            firstOrderId,
            'ORDER_UPDATED',
            `📋 The load plan for your batch has been updated. Please review your new delivery sequence before dispatching.`
        );
    }

    // Populate and return updated batch
    const updated = await DeliveryBatch.findById(req.params.id)
        .populate('driver')
        .populate({
            path: 'orders',
            populate: [
                { path: 'crop', select: 'name unit price images' },
                { path: 'farmer', select: 'name phone' },
                { path: 'vendor', select: 'name phone' }
            ]
        });

    res.json({ success: true, data: updated });
});

module.exports = {
    autoGroupOrders,
    assignDriverToBatch,
    getActiveBatchForDriver,
    updateBatchStatus,
    deliverOrderInBatch,
    getAllBatches,
    getBatchById,
    updateBatchLoadPlan
};

