const express = require('express');
const { getDrivers, createDriver, deleteDriver } = require('../controllers/driverController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply auth protection and farmer role check to all driver routes
router.use(protect);
router.use(authorize('FARMER'));

router.route('/')
    .get(getDrivers)
    .post(createDriver);

router.route('/:id')
    .delete(deleteDriver);

module.exports = router;
