const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('../src/config/db');
const OrderRequest = require('../src/models/OrderRequest');
const User = require('../src/models/User');
const Crop = require('../src/models/Crop');
const Driver = require('../src/models/Driver');
const FarmerProfile = require('../src/models/FarmerProfile');
const VendorProfile = require('../src/models/VendorProfile');
const MockBankAccount = require('../src/models/MockBankAccount');

dotenv.config();

const seedBatchData = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB...');

        // Find or create Sumit meena (FARMER)
        let sumitFarmer = await User.findOne({ 
            $or: [
                { phone: '6261652446' }, 
                { email: 'sumitmeenaji9@gmail.com' }
            ]
        });

        if (!sumitFarmer) {
            sumitFarmer = await User.create({
                phone: '6261652446',
                email: 'sumitmeenaji9@gmail.com',
                name: 'Sumit meena',
                role: 'FARMER',
                password: 'password123',
                kycStatus: 'Approved'
            });
            console.log('Created Sumit meena farmer user.');
        } else {
            sumitFarmer.role = 'FARMER';
            sumitFarmer.kycStatus = 'Approved';
            await sumitFarmer.save();
            console.log('Using existing Sumit meena farmer user.');
        }

        // Clear other test collections to start fresh
        console.log('Clearing old test data...');
        await OrderRequest.deleteMany({});
        await Driver.deleteMany({});
        await FarmerProfile.deleteMany({});
        await VendorProfile.deleteMany({});
        await Crop.deleteMany({});
        await MockBankAccount.deleteMany({});
        
        // Clean up other test users except Sumit meena
        await User.deleteMany({ 
            _id: { $ne: sumitFarmer._id },
            phone: { $in: ['8888800001', '8888800002', '8888800003'] } 
        });

        // Create 3 fake Vendors
        console.log('Creating fake vendors...');
        const vendorA = await User.create({
            phone: '8888800001',
            name: 'Amit Gupta (Vendor A)',
            role: 'VENDOR',
            password: 'password123',
            kycStatus: 'Approved'
        });
        const vendorB = await User.create({
            phone: '8888800002',
            name: 'Sumit Sharma (Vendor B)',
            role: 'VENDOR',
            password: 'password123',
            kycStatus: 'Approved'
        });
        const vendorC = await User.create({
            phone: '8888800003',
            name: 'Vijay Verma (Vendor C)',
            role: 'VENDOR',
            password: 'password123',
            kycStatus: 'Approved'
        });

        // Create Mock Bank Accounts
        await MockBankAccount.create([
            { user: sumitFarmer._id, accountNumber: '1111111111', accountHolderName: sumitFarmer.name, balance: 80000 },
            { user: vendorA._id, accountNumber: '9999999991', accountHolderName: vendorA.name, balance: 250000 },
            { user: vendorB._id, accountNumber: '9999999992', accountHolderName: vendorB.name, balance: 150000 },
            { user: vendorC._id, accountNumber: '9999999993', accountHolderName: vendorC.name, balance: 180000 }
        ]);

        console.log('Creating profiles...');
        // Set Sumit's Farm coordinates (Dispatch Origin) in Gurugram
        await FarmerProfile.create({
            user: sumitFarmer._id,
            location: {
                state: 'Haryana',
                district: 'Gurugram',
                village: 'Badshahpur',
                coordinates: { lat: 28.412, lng: 77.032 }
            },
            farmDetails: { landSize: 15, landUnit: 'Acres', crops: 'Tomato, Potato, Wheat', irrigation: 'Tubewell' },
            isVerified: true
        });

        // 3 Vendor Profiles with distinct coordinates representing delivery stops
        await VendorProfile.create([
            {
                user: vendorA._id,
                businessName: 'Gupta Fresh Store',
                godownAddress: 'Sector 56 Market, Gurugram',
                city: 'Gurugram',
                state: 'Haryana',
                coordinates: { lat: 28.459, lng: 77.072 },
                interestedCategories: ['Vegetables', 'Grains']
            },
            {
                user: vendorB._id,
                businessName: 'Sharma Veggies',
                godownAddress: 'Sector 49 Market, Gurugram',
                city: 'Gurugram',
                state: 'Haryana',
                coordinates: { lat: 28.418, lng: 77.052 },
                interestedCategories: ['Vegetables', 'Grains']
            },
            {
                user: vendorC._id,
                businessName: 'Vijay Traders',
                godownAddress: 'Sector 45 Godowns, Gurugram',
                city: 'Gurugram',
                state: 'Haryana',
                coordinates: { lat: 28.452, lng: 77.038 },
                interestedCategories: ['Vegetables', 'Grains']
            }
        ]);

        console.log('Creating different Vegetable Crops for Sumit...');
        const cropA = await Crop.create({
            farmerId: sumitFarmer._id,
            name: 'Fresh Red Tomatoes',
            category: 'Vegetables',
            price: 30,
            unit: 'Kg',
            quantity: 2000,
            location: 'Badshahpur Greenhouse 1',
            variety: 'Desi Red',
            harvestDate: new Date(),
            farmingMethod: 'Organic',
            qualityGrade: 'Grade A',
            minOrderQuantity: 10,
            logisticsOption: 'Transport Available',
            availabilityStatus: 'Ready to Dispatch',
            paymentTerms: 'Cash on Delivery',
            images: [],
            isAvailable: true
        });

        const cropB = await Crop.create({
            farmerId: sumitFarmer._id,
            name: 'Organic Potatoes',
            category: 'Vegetables',
            price: 20,
            unit: 'Kg',
            quantity: 3000,
            location: 'Badshahpur Cold Room A',
            variety: 'Kufri Jyoti',
            harvestDate: new Date(),
            farmingMethod: 'Conventional',
            qualityGrade: 'Grade A',
            minOrderQuantity: 20,
            logisticsOption: 'Transport Available',
            availabilityStatus: 'Ready to Dispatch',
            paymentTerms: 'Cash on Delivery',
            images: [],
            isAvailable: true
        });

        const cropC = await Crop.create({
            farmerId: sumitFarmer._id,
            name: 'Green Cabbage',
            category: 'Vegetables',
            price: 25,
            unit: 'Kg',
            quantity: 1500,
            location: 'Badshahpur Field 3',
            variety: 'Golden Acre',
            harvestDate: new Date(),
            farmingMethod: 'Conventional',
            qualityGrade: 'Grade B',
            minOrderQuantity: 15,
            logisticsOption: 'Transport Available',
            availabilityStatus: 'Ready to Dispatch',
            paymentTerms: 'Cash on Delivery',
            images: [],
            isAvailable: true
        });

        console.log('Creating Drivers for Sumit\'s fleet...');
        // Create Truck Driver
        const driverTruck = await Driver.create({
            farmer: sumitFarmer._id,
            name: 'Sher Singh (Truck Carrier)',
            phone: '9876500001',
            vehicleNumber: 'HR-26-TR-9999',
            vehicleType: 'Mini Truck',
            payloadCapacity: 1500,
            status: 'Available'
        });

        // Create Bike Driver
        const driverBike = await Driver.create({
            farmer: sumitFarmer._id,
            name: 'Rahul Kumar (Bike Carrier)',
            phone: '9876500002',
            vehicleNumber: 'HR-26-BK-8888',
            vehicleType: 'Bike',
            payloadCapacity: 80,
            status: 'Available'
        });

        console.log('Creating 3 Confirmed Orders from different vendors for Sumit\'s Crops...');
        const ordersData = [
            { crop: cropA._id, vendor: vendorA._id, qty: 100, price: 30 },
            { crop: cropB._id, vendor: vendorB._id, qty: 120, price: 20 },
            { crop: cropC._id, vendor: vendorC._id, qty: 60, price: 25 }
        ];

        for (let i = 0; i < ordersData.length; i++) {
            const data = ordersData[i];
            const otp = Math.floor(1000 + Math.random() * 9000).toString();

            await OrderRequest.create({
                crop: data.crop,
                farmer: sumitFarmer._id,
                vendor: data.vendor,
                requestedQuantity: data.qty,
                offeredPrice: data.price,
                status: 'Accepted',
                deliveryStatus: 'Pending',
                deliveryOTP: otp,
                payment: {
                    amount: data.qty * data.price,
                    status: 'Verified',
                    method: 'Cash',
                    paidAt: new Date(),
                    verifiedAt: new Date()
                }
            });
        }

        console.log('\n=========================================');
        console.log('✅ DATABASE SEEDED SUCCESSFULLY FOR SUMIT MEENA!');
        console.log('=========================================');
        console.log(`Farmer Account: Sumit meena (ID: ${sumitFarmer._id})`);
        console.log(`Email:          ${sumitFarmer.email}`);
        console.log(`Phone:          ${sumitFarmer.phone}`);
        console.log('-----------------------------------------');
        console.log('Drivers:');
        console.log(`- Sher Singh (Truck Carrier): ID: ${driverTruck._id}`);
        console.log(`- Rahul Kumar (Bike Carrier):  ID: ${driverBike._id}`);
        console.log('-----------------------------------------');
        console.log('3 Confirmed test orders (Tomato, Potato, Cabbage) are ready in your dashboard!');
        console.log('=========================================\n');

        process.exit(0);
    } catch (err) {
        console.error('Error seeding database:', err);
        process.exit(1);
    }
};

seedBatchData();
