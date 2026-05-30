const mongoose = require('mongoose');
const User = require('./src/models/User');
const bcrypt = require('bcryptjs');

const checkDB = async () => {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/agriconnect');
        console.log("Connected to DB");

        const user = await User.findOne({ phone: '6261652446' }).select('+password');
        console.log("User:", user);
        
        if (user) {
            const isMatch = await bcrypt.compare('@Sumit123', user.password);
            console.log("Password matches?", isMatch);
        }

        mongoose.disconnect();
    } catch (e) {
        console.error(e);
        mongoose.disconnect();
    }
};

checkDB();
