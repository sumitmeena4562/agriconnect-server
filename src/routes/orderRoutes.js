const express = require('express');
const router = express.Router();
const { 
    createOrderRequest, 
    getOrders, 
    updateOrderStatus 
} = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All order routes require authentication
router.use(protect);

router.route('/')
    .post(authorize('VENDOR', 'CUSTOMER'), createOrderRequest)
    .get(getOrders);

router.patch('/:id/status', updateOrderStatus);

module.exports = router;
