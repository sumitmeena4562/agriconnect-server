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
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/auto-group', autoGroupOrders);
router.post('/:id/assign-driver', assignDriverToBatch);
router.get('/driver/active', getActiveBatchForDriver);
router.patch('/:id/status', updateBatchStatus);
router.patch('/:id/orders/:orderId/deliver', deliverOrderInBatch);
router.get('/', getAllBatches);
router.get('/:id', getBatchById);
router.put('/:id/load-plan', updateBatchLoadPlan);

module.exports = router;
