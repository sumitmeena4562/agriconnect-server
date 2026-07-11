const Driver = require('../models/Driver');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get all drivers registered by the logged-in farmer
// @route   GET /api/v1/drivers
// @access  Private (Farmer only)
const getDrivers = asyncHandler(async (req, res) => {
    if (req.user.role !== 'FARMER') {
        throw new ErrorResponse('Not authorized. Farmers only.', 403);
    }

    const drivers = await Driver.find({ farmer: req.user.id }).sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        count: drivers.length,
        data: drivers
    });
});

// @desc    Register a new driver/vehicle
// @route   POST /api/v1/drivers
// @access  Private (Farmer only)
const createDriver = asyncHandler(async (req, res) => {
    if (req.user.role !== 'FARMER') {
        throw new ErrorResponse('Not authorized. Farmers only.', 403);
    }

    const { 
        name, 
        phone, 
        vehicleNumber, 
        vehicleType, 
        payloadCapacity, 
        licenseNumber, 
        rcNumber, 
        address, 
        insuranceDoc, 
        emergencyContactName,
        emergencyContactPhone,
        aadhaarNumber,
        licenseClass,
        licenseExpiry,
        rcExpiry,
        vehicleModel,
        fuelType,
        insurancePolicyNumber,
        insuranceExpiry,
        panNumber,
        bankAccountName,
        bankAccountNumber,
        bankAccountIfsc,
        upiId,
        latitude, 
        longitude 
    } = req.body;

    if (!name || !phone || !vehicleNumber || !vehicleType || !payloadCapacity) {
        throw new ErrorResponse('Please provide name, phone, vehicle number, vehicle type, and payload capacity', 400);
    }

    const driver = await Driver.create({
        farmer: req.user.id,
        name,
        phone,
        vehicleNumber,
        vehicleType,
        payloadCapacity,
        licenseNumber,
        rcNumber,
        address,
        insuranceDoc,
        emergencyContactName,
        emergencyContactPhone,
        aadhaarNumber,
        licenseClass,
        licenseExpiry,
        rcExpiry,
        vehicleModel,
        fuelType,
        insurancePolicyNumber,
        insuranceExpiry,
        panNumber,
        bankAccountName,
        bankAccountNumber,
        bankAccountIfsc,
        upiId,
        latitude: latitude || 28.6139,
        longitude: longitude || 77.2090
    });

    res.status(201).json({
        success: true,
        data: driver,
        message: 'Driver and vehicle registered successfully'
    });
});

// @desc    Delete a registered driver
// @route   DELETE /api/v1/drivers/:id
// @access  Private (Farmer only)
const deleteDriver = asyncHandler(async (req, res) => {
    if (req.user.role !== 'FARMER') {
        throw new ErrorResponse('Not authorized. Farmers only.', 403);
    }

    const driver = await Driver.findById(req.params.id);

    if (!driver) {
        throw new ErrorResponse('Driver not found', 404);
    }

    // Double check ownership
    if (driver.farmer.toString() !== req.user.id) {
        throw new ErrorResponse('Not authorized to delete this driver', 403);
    }

    // Check if driver is currently busy
    if (driver.status === 'On Delivery') {
        throw new ErrorResponse('Cannot delete a driver currently on active delivery', 400);
    }

    await driver.deleteOne();

    res.status(200).json({
        success: true,
        message: 'Driver and vehicle removed from fleet'
    });
});

const VehicleType = require('../models/VehicleType');

// @desc    Get all predefined vehicle types
// @route   GET /api/v1/drivers/vehicle-types
// @access  Private (Farmer only)
const getVehicleTypes = asyncHandler(async (req, res) => {
    const types = await VehicleType.find().sort({ capacityKg: 1 });
    res.status(200).json({
        success: true,
        data: types
    });
});

module.exports = {
    getDrivers,
    createDriver,
    deleteDriver,
    getVehicleTypes
};
