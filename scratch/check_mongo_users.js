const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');

dotenv.config();

const checkUsers = async () => {
    try {
        await connectDB();
        const users = await User.find({
            $or: [
                { name: /sumit/i },
                { phone: /sumit/i },
                { email: /sumit/i },
                { name: /meena/i }
            ]
        });
        console.log('Matching Users in DB:', JSON.stringify(users, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkUsers();
