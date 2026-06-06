const express = require('express');
const router = express.Router();
const { getBankAccount, depositFunds, getTransactionHistory } = require('../controllers/bankController');
const { protect } = require('../middleware/authMiddleware');

// All bank routes require authentication
router.use(protect);

router.get('/account', getBankAccount);
router.post('/deposit', depositFunds);
router.get('/transactions', getTransactionHistory);

module.exports = router;
