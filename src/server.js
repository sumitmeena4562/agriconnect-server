const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const colors = require('colors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const errorHandler = require('./middleware/error');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Set security headers
app.use(helmet());

// Compress all responses
app.use(compression());

// Body parser
app.use(express.json());

// Enable CORS
app.use(cors());

// Log HTTP Requests
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Custom Middleware to log Data (Payloads)
app.use((req, res, next) => {
    console.log(`\n--- [${req.method}] ${req.url} ---`.cyan);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log("Incoming Data (req.body):".yellow);
        console.log(req.body);
    }
    console.log("--------------------------\n".cyan);
    next();
});

const farmerRoutes = require('./routes/farmerRoutes');
const authRoutes = require('./routes/authRoutes');
const cropRoutes = require('./routes/cropRoutes');

// Basic Route
app.get('/', (req, res) => {
    res.send('AgriConnect API is running...');
});

// Mount routes
app.use('/api/farmers', farmerRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/crops', cropRoutes);

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
