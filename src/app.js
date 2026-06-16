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

// Behind the nginx reverse proxy: trust the first proxy hop so req.ip,
// req.protocol (X-Forwarded-Proto), and rate limiting key on the real
// client IP instead of 127.0.0.1.
app.set('trust proxy', 1);

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

// CORS — native mobile apps send no Origin header (allowed). Browser
// origins must be explicitly allowlisted via CORS_ORIGINS (comma-separated).
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // mobile app / server-to-server
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
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
// Public legal pages (privacy / terms / support)
// ============================================================

// Stable top-level URLs (e.g. https://api.unmutee.in/legal/privacy)
app.use('/legal', require('./routes/legal.routes'));

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
