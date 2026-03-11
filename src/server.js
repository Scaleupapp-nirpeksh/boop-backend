require('dotenv').config();

const http = require('http');
const logger = require('./utils/logger');
const { connectDB, closeDB } = require('./config/database');
const { connectRedis, closeRedis } = require('./config/redis');
const { initializeQueues, registerProcessors, closeQueues } = require('./config/queue');
const app = require('./app');
const socketManager = require('./config/socket');

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const startServer = async () => {
  try {
    // 1. Connect to MongoDB (required)
    await connectDB();
    logger.info('MongoDB connection established');

    // 2. Connect to Redis (non-fatal)
    try {
      await connectRedis();
    } catch (error) {
      logger.warn('Redis connection failed — app will continue without Redis:', error.message);
    }

    // 3. Initialize Bull queues (requires Redis)
    try {
      initializeQueues();
      registerProcessors();
    } catch (error) {
      logger.warn('Bull queue initialization failed (non-fatal):', error.message);
    }

    // 4. Create HTTP server from Express app
    const server = http.createServer(app);

    // 5. Initialize Socket.IO with the HTTP server
    socketManager.initialize(server);

    // 6. Start listening
    server.listen(PORT, () => {
      logger.info('===========================================');
      logger.info(`  Boop API Server`);
      logger.info(`  Port:        ${PORT}`);
      logger.info(`  Environment: ${NODE_ENV}`);
      logger.info(`  API:         /api/${process.env.API_VERSION || 'v1'}`);
      logger.info(`  MongoDB:     Connected`);
      logger.info('===========================================');
    });

    // =========================================================
    // Graceful Shutdown
    // =========================================================

    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close MongoDB
          await closeDB();
          logger.info('MongoDB connection closed');
        } catch (err) {
          logger.error('Error closing MongoDB:', err);
        }

        try {
          // Close Bull queues
          await closeQueues();
        } catch (err) {
          logger.error('Error closing Bull queues:', err);
        }

        try {
          // Close Redis
          await closeRedis();
          logger.info('Redis connection closed');
        } catch (err) {
          logger.error('Error closing Redis:', err);
        }

        logger.info('Graceful shutdown complete');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time. Forcing shutdown.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // =========================================================
    // Process Error Handlers
    // =========================================================

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      // Give time for the logger to flush before exiting
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
