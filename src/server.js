const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const colors = require('colors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const errorHandler = require('./middleware/error');
const connectDB = require('./config/db');
const { requestLogger } = require('./middleware/logger');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Set security headers
app.use(helmet());

// Compress all responses
app.use(compression());

// Body parser (Increased limit to 50mb to allow Base64 image uploads)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Centralized request tracing and logging middleware
app.use(requestLogger);

// Enable CORS
app.use(cors());

const path = require('path');
const farmerRoutes = require('./routes/farmerRoutes');
const authRoutes = require('./routes/authRoutes');
const cropRoutes = require('./routes/cropRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const orderRoutes = require('./routes/orderRoutes');

// Make the uploads folder statically available
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

// Basic Route
app.get('/', (req, res) => {
    res.send('AgriConnect API is running...');
});

// Mount routes
app.use('/api/farmers', farmerRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/crops', cropRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/orders', orderRoutes);

// Error Handler Middleware (MUST be after routes)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`\n=========================================`.green.bold);
    console.log(`    🌾 AGRICONNECT BACKEND SERVER 🌾     `.green.bold);
    console.log(`=========================================`.green.bold);
    console.log(`🚀 Status: `.cyan.bold + `RUNNING`.green.bold);
    console.log(`🌍 Mode:   `.cyan.bold + `${process.env.NODE_ENV}`.yellow.bold);
    console.log(`🔌 Port:   `.cyan.bold + `${PORT}`.yellow.bold);
    console.log(`=========================================\n`.green.bold);
});
