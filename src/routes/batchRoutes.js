const express = require('express');
const router = express.Router();
const {
    autoGroupOrders,
    assignDriverToBatch,
    getActiveBatchForDriver,
    updateBatchStatus,
    deliverOrderInBatch,
    getAllBatches,
    getBatchById,
    updateBatchLoadPlan
} = require('../controllers/batchController');
const { protect, authorize } = require('../middleware/authMiddleware');

// ── Public routes (drivers have no login account — they use shared link with driverId)
router.get('/driver/active', getActiveBatchForDriver);
router.patch('/:id/orders/:orderId/deliver', deliverOrderInBatch);

// ── All other batch routes require authentication
router.use(protect);

// ── Farmer-only routes (only FARMER role can create/manage batches)
router.post('/auto-group', authorize('FARMER'), autoGroupOrders);
router.post('/:id/assign-driver', authorize('FARMER'), assignDriverToBatch);
router.put('/:id/load-plan', authorize('FARMER'), updateBatchLoadPlan);

// ── Any authenticated user (farmer + vendor can view)
router.patch('/:id/status', updateBatchStatus);
router.get('/', getAllBatches);
router.get('/:id', getBatchById);

module.exports = router;

