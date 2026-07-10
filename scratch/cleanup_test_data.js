const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('../src/config/db');
const OrderRequest = require('../src/models/OrderRequest');
const DeliveryBatch = require('../src/models/DeliveryBatch');
const User = require('../src/models/User');
const Crop = require('../src/models/Crop');
const Driver = require('../src/models/Driver');
const FarmerProfile = require('../src/models/FarmerProfile');
const VendorProfile = require('../src/models/VendorProfile');
const MockBankAccount = require('../src/models/MockBankAccount');

dotenv.config();

const cleanupData = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB for cleanup...');

        console.log('Cleaning up mock test collections...');
        
        // Delete all orders and batches
        const orderDel = await OrderRequest.deleteMany({});
        const batchDel = await DeliveryBatch.deleteMany({});
        console.log(`Deleted ${orderDel.deletedCount} orders and ${batchDel.deletedCount} batches.`);

        // Delete all drivers, crops, and bank accounts
        const driverDel = await Driver.deleteMany({});
        const cropDel = await Crop.deleteMany({});
        const bankDel = await MockBankAccount.deleteMany({});
        console.log(`Deleted ${driverDel.deletedCount} drivers, ${cropDel.deletedCount} crops, and ${bankDel.deletedCount} bank accounts.`);

        // Delete all farmer and vendor profiles
        const farmerProfDel = await FarmerProfile.deleteMany({});
        const vendorProfDel = await VendorProfile.deleteMany({});
        console.log(`Deleted ${farmerProfDel.deletedCount} farmer profiles and ${vendorProfDel.deletedCount} vendor profiles.`);

        // Clean up mock vendors (preserve main users, only delete seeded test users)
        const userDel = await User.deleteMany({
            phone: { $in: ['9999900001', '8888800001', '8888800002', '8888800003'] }
        });
        console.log(`Deleted ${userDel.deletedCount} seeded test users.`);

        console.log('\n=========================================');
        console.log('✅ DATABASE CLEANED UP SUCCESSFULLY!');
        console.log('=========================================');
        console.log('All mock orders, crops, drivers, and fake vendors are deleted.');
        console.log('Your farmer account (Sumit meena) is preserved in a clean state.');
        console.log('=========================================\n');

        process.exit(0);
    } catch (err) {
        console.error('Error cleaning database:', err);
        process.exit(1);
    }
};

cleanupData();
