const mongoose = require('mongoose');

const bankTransactionSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OrderRequest',
        default: null
    },
    amount: {
        type: Number,
        required: true,
        min: [0, 'Transaction amount must be positive']
    },
    type: {
        type: String,
        enum: ['DEPOSIT', 'PAYMENT', 'REFUND'],
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed'],
        default: 'Completed'
    },
    description: {
        type: String,
        default: ''
    }
}, { timestamps: true });

bankTransactionSchema.index({ sender: 1, createdAt: -1 });
bankTransactionSchema.index({ receiver: 1, createdAt: -1 });

const BankTransaction = mongoose.model('BankTransaction', bankTransactionSchema);
module.exports = BankTransaction;
