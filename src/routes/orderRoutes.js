const express = require('express');
const router = express.Router();
const { 
    createOrderRequest, 
    getOrders, 
    updateOrderStatus,
    submitPayment,
    verifyPayment,
    dispatchOrder,
    getLiveTracking
} = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const {
    createOrderSchema,
    updateOrderStatusSchema,
    submitPaymentSchema,
    verifyPaymentSchema,
} = require('../validations/orderSchemas');

// All order routes require authentication
router.use(protect);

router.route('/')
    .post(authorize('VENDOR', 'CUSTOMER'), validateRequest(createOrderSchema), createOrderRequest)
    .get(getOrders);

router.patch('/:id/status', validateRequest(updateOrderStatusSchema), updateOrderStatus);

// Payment routes
router.patch('/:id/payment',        authorize('VENDOR', 'CUSTOMER'), validateRequest(submitPaymentSchema),  submitPayment);
router.patch('/:id/payment/verify', authorize('FARMER'),             validateRequest(verifyPaymentSchema),  verifyPayment);

// Logistics / Dispatch routes
router.patch('/:id/dispatch',       authorize('FARMER'), dispatchOrder);
router.get('/:id/tracking',         getLiveTracking);

module.exports = router;
