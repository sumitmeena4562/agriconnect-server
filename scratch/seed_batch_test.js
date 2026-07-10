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

        // Find or use Sumit meena (FARMER)
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
            console.log('Using existing Sumit meena farmer.');
        }

        // Clear other test collections to start fresh
        console.log('Clearing old test data...');
        await OrderRequest.deleteMany({});
        await Driver.deleteMany({});
        await FarmerProfile.deleteMany({});
        await VendorProfile.deleteMany({});
        await Crop.deleteMany({});
        await MockBankAccount.deleteMany({});
        
        // Clean up other test users
        await User.deleteMany({ 
            _id: { $ne: sumitFarmer._id },
            phone: { $in: ['8888800001', '8888800002', '8888800003', '8888800004', '8888800005'] } 
        });

        console.log('Creating 5 Fake Vendors along a single route in Indore...');
        const vendorsData = [
            { phone: '8888800001', name: 'Indore Fresh Store (Vendor 1)', lat: 22.7250, lng: 75.8650, addr: 'A.B. Road, Stop 1, Indore' },
            { phone: '8888800002', name: 'Malwa Veggies (Vendor 2)', lat: 22.7350, lng: 75.8750, addr: 'A.B. Road, Stop 2, Indore' },
            { phone: '8888800003', name: 'Chappan Grocery (Vendor 3)', lat: 22.7450, lng: 75.8850, addr: 'A.B. Road, Stop 3, Indore' },
            { phone: '8888800004', name: 'Rajwada Greens (Vendor 4)', lat: 22.7550, lng: 75.8950, addr: 'A.B. Road, Stop 4, Indore' },
            { phone: '8888800005', name: 'Sarafa Organic Mart (Vendor 5)', lat: 22.7650, lng: 75.9050, addr: 'A.B. Road, Stop 5, Indore' }
        ];

        const vendors = [];
        for (const data of vendorsData) {
            const user = await User.create({
                phone: data.phone,
                name: data.name,
                role: 'VENDOR',
                password: 'password123',
                kycStatus: 'Approved'
            });
            vendors.push(user);

            await VendorProfile.create({
                user: user._id,
                businessName: data.name.split(' (')[0],
                godownAddress: data.addr,
                city: 'Indore',
                state: 'Madhya Pradesh',
                coordinates: { lat: data.lat, lng: data.lng },
                interestedCategories: ['Vegetables']
            });

            await MockBankAccount.create({
                user: user._id,
                accountNumber: `999990000${data.phone.slice(-1)}`,
                accountHolderName: user.name,
                balance: 200000
            });
        }

        // Create Farmer Profile and Bank Account for Sumit
        await FarmerProfile.create({
            user: sumitFarmer._id,
            location: {
                state: 'Madhya Pradesh',
                district: 'Indore',
                village: 'Vijay Nagar',
                coordinates: { lat: 22.7196, lng: 75.8577 } // Dispatch Origin
            },
            farmDetails: { landSize: 15, landUnit: 'Acres', crops: 'Tomato, Potato, Onion, Cabbage, Cauliflower', irrigation: 'Tubewell' },
            isVerified: true
        });

        await MockBankAccount.create({
            user: sumitFarmer._id,
            accountNumber: '1111111111',
            accountHolderName: sumitFarmer.name,
            balance: 100000
        });

        console.log('Creating 5 different vegetable crops for Sumit...');
        const cropsList = [
            { name: 'Fresh Red Tomatoes', price: 30, variety: 'Desi Red' },
            { name: 'Organic Potatoes', price: 20, variety: 'Kufri Jyoti' },
            { name: 'Pink Onions', price: 35, variety: 'Nasik Pink' },
            { name: 'Green Cabbage', price: 25, variety: 'Golden Acre' },
            { name: 'Phool Gobhi (Cauliflower)', price: 40, variety: 'Snowball' }
        ];

        const crops = [];
        for (const c of cropsList) {
            const crop = await Crop.create({
                farmerId: sumitFarmer._id,
                name: c.name,
                category: 'Vegetables',
                price: c.price,
                unit: 'Kg',
                quantity: 2000,
                location: 'Indore Farm Warehouse',
                coordinates: { lat: 22.7196, lng: 75.8577 }, // Crop pickup coordinates
                variety: c.variety,
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
            crops.push(crop);
        }

        console.log('Creating Drivers for Sumit\'s fleet...');
        const driverTruck = await Driver.create({
            farmer: sumitFarmer._id,
            name: 'Sher Singh (Truck Carrier)',
            phone: '9876500001',
            vehicleNumber: 'MP-09-TR-9999',
            vehicleType: 'Mini Truck',
            payloadCapacity: 1500,
            status: 'Available'
        });

        const driverBike = await Driver.create({
            farmer: sumitFarmer._id,
            name: 'Rahul Kumar (Bike Carrier)',
            phone: '9876500002',
            vehicleNumber: 'MP-09-BK-8888',
            vehicleType: 'Bike',
            payloadCapacity: 80,
            status: 'Available'
        });

        console.log('Creating 5 Confirmed Orders from different vendors for Sumit\'s Crops...');
        const ordersData = [
            { crop: crops[0]._id, vendor: vendors[0]._id, qty: 100, price: 30 }, // Vendor 1
            { crop: crops[1]._id, vendor: vendors[1]._id, qty: 120, price: 20 }, // Vendor 2
            { crop: crops[2]._id, vendor: vendors[2]._id, qty: 150, price: 35 }, // Vendor 3
            { crop: crops[3]._id, vendor: vendors[3]._id, qty: 80, price: 25 },  // Vendor 4
            { crop: crops[4]._id, vendor: vendors[4]._id, qty: 90, price: 40 }   // Vendor 5
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

        console.log('\n================================================================');
        console.log('✅ 5-VENDOR SEQUENTIAL ROUTE SEEDED SUCCESSFULLY FOR SUMIT MEENA!');
        console.log('================================================================');
        console.log(`Farmer Account: Sumit meena (Phone: 6261652446 / Password: password123)`);
        console.log('----------------------------------------------------------------');
        console.log('Seeded Vegetables: Tomatoes, Potatoes, Onions, Cabbage, Cauliflower');
        console.log('----------------------------------------------------------------');
        console.log('Vendors Route Sequence (A.B. Road, Indore):');
        console.log('1. Indore Fresh Store (Vendor 1) ➔ lat: 22.7250, lng: 75.8650');
        console.log('2. Malwa Veggies (Vendor 2)       ➔ lat: 22.7350, lng: 75.8750');
        console.log('3. Chappan Grocery (Vendor 3)    ➔ lat: 22.7450, lng: 75.8850');
        console.log('4. Rajwada Greens (Vendor 4)     ➔ lat: 22.7550, lng: 75.8950');
        console.log('5. Sarafa Organic Mart (Vendor 5)➔ lat: 22.7650, lng: 75.9050');
        console.log('----------------------------------------------------------------');
        console.log('Drivers:');
        console.log(`- Sher Singh (Truck Carrier): ID: ${driverTruck._id}`);
        console.log(`- Rahul Kumar (Bike Carrier):  ID: ${driverBike._id}`);
        console.log('================================================================\n');

        process.exit(0);
    } catch (err) {
        console.error('Error seeding database:', err);
        process.exit(1);
    }
};

seedBatchData();
