const express = require('express');
const router = express.Router();
const { 
    createOrderRequest, 
    getOrders, 
    updateOrderStatus,
    submitPayment,
    verifyPayment,
} = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All order routes require authentication
router.use(protect);

router.route('/')
    .post(authorize('VENDOR', 'CUSTOMER'), createOrderRequest)
    .get(getOrders);

router.patch('/:id/status', updateOrderStatus);

// Payment routes
router.patch('/:id/payment',        authorize('VENDOR', 'CUSTOMER'), submitPayment);
router.patch('/:id/payment/verify', authorize('FARMER'),             verifyPayment);

module.exports = router;

