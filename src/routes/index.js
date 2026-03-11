const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const profileRoutes = require('./profile.routes');
const questionRoutes = require('./question.routes');
const discoverRoutes = require('./discover.routes');
const matchRoutes = require('./match.routes');
const messageRoutes = require('./message.routes');
const gameRoutes = require('./game.routes');
const notificationRoutes = require('./notification.routes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/questions', questionRoutes);
router.use('/discover', discoverRoutes);
router.use('/matches', matchRoutes);
router.use('/messages', messageRoutes);
router.use('/games', gameRoutes);
router.use('/notifications', notificationRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const mongoStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Boop API is running',
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      mongodb: mongoStates[mongoState] || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
    },
  });
});

module.exports = router;
