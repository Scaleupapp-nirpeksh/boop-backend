const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const morgan = require('morgan');

const routes = require('./routes/index');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { globalLimiter } = require('./middleware/rateLimiter');

const app = express();

const API_VERSION = process.env.API_VERSION || 'v1';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================
// Security Middleware
// ============================================================

// Helmet — set security HTTP headers (disable CSP for dev)
app.use(
  helmet({
    contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
  })
);

// CORS
app.use(
  cors({
    origin: '*', // Restrict in production
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ============================================================
// Body Parsing
// ============================================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================
// Cookie Parsing
// ============================================================

app.use(cookieParser());

// ============================================================
// Data Sanitization
// ============================================================

// Prevent MongoDB operator injection
app.use(mongoSanitize());

// ============================================================
// Compression
// ============================================================

app.use(compression());

// ============================================================
// Logging
// ============================================================

if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ============================================================
// Rate Limiting
// ============================================================

app.use(globalLimiter);

// ============================================================
// API Routes
// ============================================================

app.use(`/api/${API_VERSION}`, routes);

// ============================================================
// Error Handling
// ============================================================

// 404 handler — must be after all routes
app.use(notFound);

// Global error handler — must be last middleware
app.use(errorHandler);

module.exports = app;
