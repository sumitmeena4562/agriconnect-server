const express = require('express');
const { 
  addCrop, getFarmerCrops, getCropById, updateCrop, deleteCrop,
  toggleCropStatus, incrementCropView
} = require('../controllers/cropController');
const { protect, authorize } = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { addCropSchema } = require('../validations/cropSchemas');

const router = express.Router();

// Public route for incrementing view count
router.patch('/:id/view', incrementCropView);

// Apply protection to all other crop routes
router.use(protect);

// Apply role authorization (only Farmers can add/view their own crops)
router.use(authorize('FARMER'));

router.route('/')
  .post(validateRequest(addCropSchema), addCrop)
  .get(getFarmerCrops);

router.route('/:id')
  .get(getCropById)
  .put(validateRequest(addCropSchema), updateCrop)
  .delete(deleteCrop);

router.patch('/:id/status', toggleCropStatus);

module.exports = router;
