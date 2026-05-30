const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        unique: true,
        sparse: true // Allows multiple users to have no email (null/undefined) without triggering unique constraint
    },
    password: {
        type: String,
        required: function() { return this.authProvider === 'LOCAL'; },
        select: false // Do not return password by default
    },
    name: {
        type: String,
        required: true
    },
    authProvider: {
        type: String,
        enum: ['LOCAL', 'GOOGLE'],
        default: 'LOCAL'
    },
    googleId: {
        type: String
    },
    role: {
        type: String,
        enum: ['FARMER', 'VENDOR', 'CUSTOMER', 'ADMIN'],
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function () {
    // Only hash the password if it's been modified and it exists
    if (!this.isModified('password') || !this.password) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Method to check password match
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Generate and hash password token
userSchema.methods.getSignedJwtToken = function () {
    return jwt.sign({ id: this._id, role: this.role }, process.env.JWT_SECRET || 'secretkey123', {
        expiresIn: '30d'
    });
};

const User = mongoose.model('User', userSchema);
module.exports = User;
