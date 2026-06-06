const mongoose = require('mongoose');

const mockBankAccountSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    accountHolderName: {
        type: String,
        required: true
    },
    accountNumber: {
        type: String,
        required: true,
        unique: true
    },
    ifscCode: {
        type: String,
        default: 'AGRI0000123'
    },
    bankName: {
        type: String,
        default: 'AgriConnect Co-operative Bank'
    },
    balance: {
        type: Number,
        required: true,
        default: 0
    }
}, { timestamps: true });

const MockBankAccount = mongoose.model('MockBankAccount', mockBankAccountSchema);
module.exports = MockBankAccount;
