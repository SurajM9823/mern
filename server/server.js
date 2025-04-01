const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();
const app = express();

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Use env var for flexibility
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Added OPTIONS explicitly
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
  credentials: true,
};
app.use(cors(corsOptions));
console.log('CORS configured with origin:', corsOptions.origin);

// Enhanced request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Request Headers:', req.headers);
  console.log('Request Body:', req.body);
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] Response Status: ${res.statusCode}`);
  });
  next();
});

// Parse JSON bodies
app.use(express.json());
console.log('JSON parsing middleware enabled');

// MongoDB Connection
if (!process.env.MONGO_URI) {
  console.error('MONGO_URI not defined in .env file');
  process.exit(1); // Exit if no MongoDB URI
}

mongoose.connect(process.env.MONGO_URI, {
  // Removed deprecated options; Mongoose 6+ handles these automatically
})
  .then(() => console.log('MongoDB connected successfully to Atlas'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message, err.stack);
    process.exit(1); // Exit on connection failure
  });

// Routes
app.use('/api/auth', require('./routes/auth'));
console.log('Mounted /api/auth routes');
app.use('/api/owner', require('./routes/owner'));
console.log('Mounted /api/owner routes');
app.use('/api/parent', require('./routes/parent'));
console.log('Mounted /api/parent routes');
app.use('/api/coach', require('./routes/coach'));
console.log('Mounted /api/coach routes');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Basic health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.status(200).json({ message: 'Server is running', uptime: process.uptime() });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    body: req.body,
  });
  res.status(500).json({ message: 'Something went wrong', error: err.message });
});

// Handle uncaught exceptions and promise rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV || 'development',
    MONGO_URI: process.env.MONGO_URI ? '[redacted]' : 'not set',
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  });
});