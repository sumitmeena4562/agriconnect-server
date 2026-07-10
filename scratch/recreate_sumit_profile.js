const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const FarmerProfile = require('../src/models/FarmerProfile');
const MockBankAccount = require('../src/models/MockBankAccount');

dotenv.config();

const recreateProfile = async () => {
    try {
        await connectDB();
        
        const sumitFarmer = await User.findOne({ email: 'sumitmeenaji9@gmail.com' });
        if (!sumitFarmer) {
            console.error('Sumit meena user not found!');
            process.exit(1);
        }

        // Delete any orphan profiles if existing
        await FarmerProfile.deleteMany({ user: sumitFarmer._id });
        await MockBankAccount.deleteMany({ user: sumitFarmer._id });

        // Recreate FarmerProfile
        await FarmerProfile.create({
            user: sumitFarmer._id,
            location: {
                state: 'Madhya Pradesh',
                district: 'Indore',
                village: 'Test Village',
                coordinates: { lat: 22.7196, lng: 75.8577 }
            },
            farmDetails: { landSize: 15, landUnit: 'Acres', crops: 'Tomato, Potato, Wheat', irrigation: 'Tubewell' },
            isVerified: true
        });

        // Recreate MockBankAccount
        await MockBankAccount.create({
            user: sumitFarmer._id,
            accountNumber: '1111111111',
            accountHolderName: sumitFarmer.name,
            balance: 80000
        });

        console.log('Successfully recreated profile and bank details for Sumit meena!');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

recreateProfile();
