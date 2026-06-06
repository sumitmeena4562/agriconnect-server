const express = require('express');
const { 
  addCrop, getFarmerCrops, getCropById, updateCrop, deleteCrop,
  toggleCropStatus, incrementCropView, getMarketplaceCrops
} = require('../controllers/cropController');
const { protect, authorize } = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { addCropSchema, updateCropSchema } = require('../validations/cropSchemas');

const router = express.Router();

// Route for incrementing view count (auth protected)
router.patch('/:id/view', protect, incrementCropView);

// Marketplace route (For Vendors and Customers)
router.get('/marketplace', protect, authorize('VENDOR', 'CUSTOMER'), getMarketplaceCrops);

// Apply protection to all other crop routes
router.use(protect);

router.route('/')
  .post(authorize('FARMER'), validateRequest(addCropSchema), addCrop)
  .get(authorize('FARMER'), getFarmerCrops);

router.route('/:id')
  .get(authorize('FARMER', 'VENDOR', 'CUSTOMER'), getCropById)
  .put(authorize('FARMER'), validateRequest(updateCropSchema), updateCrop)
  .delete(authorize('FARMER'), deleteCrop);

router.patch('/:id/status', authorize('FARMER'), toggleCropStatus);

module.exports = router;
