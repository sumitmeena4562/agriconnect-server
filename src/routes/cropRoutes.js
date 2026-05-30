const express = require('express');
const { addCrop, getFarmerCrops } = require('../controllers/cropController');
const { protect, authorize } = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { addCropSchema } = require('../validations/cropSchemas');

const router = express.Router();

// Apply protection to all crop routes
router.use(protect);

// Apply role authorization (only Farmers can add/view their own crops)
router.use(authorize('FARMER'));

router.route('/')
  .post(validateRequest(addCropSchema), addCrop)
  .get(getFarmerCrops);

module.exports = router;
