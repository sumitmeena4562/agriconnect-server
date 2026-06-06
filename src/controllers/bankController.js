const MockBankAccount = require('../models/MockBankAccount');
const BankTransaction = require('../models/BankTransaction');
const User = require('../models/User');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// Helper to generate a unique mock bank account number
const generateAccountNumber = async () => {
    let exists = true;
    let accountNumber = '';
    while (exists) {
        const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString(); // 10 digits
        accountNumber = `AGRI${randomDigits}`;
        const existingAccount = await MockBankAccount.findOne({ accountNumber });
        if (!existingAccount) {
            exists = false;
        }
    }
    return accountNumber;
};

// @desc    Get current user's mock bank account details
// @route   GET /api/v1/bank/account
// @access  Private
const getBankAccount = asyncHandler(async (req, res, next) => {
    let account = await MockBankAccount.findOne({ user: req.user.id });

    if (!account) {
        // Fetch user info to set holder name and default balance
        const user = await User.findById(req.user.id);
        if (!user) {
            throw new ErrorResponse('User not found', 404);
        }

        const accountNumber = await generateAccountNumber();
        const initialBalance = user.role === 'VENDOR' ? 100000 : 0;

        account = await MockBankAccount.create({
            user: req.user.id,
            accountHolderName: user.name,
            accountNumber,
            balance: initialBalance
        });
    }

    res.status(200).json({
        success: true,
        data: account
    });
});

// @desc    Deposit mock money into current user's mock bank account
// @route   POST /api/v1/bank/deposit
// @access  Private
const depositFunds = asyncHandler(async (req, res, next) => {
    const { amount } = req.body;
    const depositAmount = Number(amount);

    if (isNaN(depositAmount) || depositAmount <= 0) {
        throw new ErrorResponse('Please provide a valid deposit amount greater than 0', 400);
    }

    let account = await MockBankAccount.findOne({ user: req.user.id });

    if (!account) {
        const user = await User.findById(req.user.id);
        if (!user) {
            throw new ErrorResponse('User not found', 404);
        }
        const accountNumber = await generateAccountNumber();
        const initialBalance = user.role === 'VENDOR' ? 100000 : 0;

        account = await MockBankAccount.create({
            user: req.user.id,
            accountHolderName: user.name,
            accountNumber,
            balance: initialBalance
        });
    }

    // Add balance
    account.balance += depositAmount;
    await account.save();

    // Create transaction log
    await BankTransaction.create({
        receiver: req.user.id,
        amount: depositAmount,
        type: 'DEPOSIT',
        status: 'Completed',
        description: `Self-deposit of mock funds`
    });

    res.status(200).json({
        success: true,
        message: `Successfully deposited ₹${depositAmount.toLocaleString('en-IN')} to mock bank account`,
        data: account
    });
});

// @desc    Get user's bank transactions history
// @route   GET /api/v1/bank/transactions
// @access  Private
const getTransactionHistory = asyncHandler(async (req, res, next) => {
    const transactions = await BankTransaction.find({
        $or: [
            { sender: req.user.id },
            { receiver: req.user.id }
        ]
    })
    .populate('sender', 'name role')
    .populate('receiver', 'name role')
    .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        count: transactions.length,
        data: transactions
    });
});

module.exports = {
    getBankAccount,
    depositFunds,
    getTransactionHistory
};
