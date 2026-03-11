const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

class SocketManager {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // userId -> Set<socketId>
    this.socketUsers = new Map(); // socketId -> userId
    this.disconnectTimers = new Map(); // userId -> timeoutId
  }

  initialize(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // JWT authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.type !== 'access') {
          return next(new Error('Invalid token type'));
        }

        const User = require('../models/User');
        const user = await User.findById(decoded.userId).select('_id firstName isActive isBanned');

        if (!user) {
          return next(new Error('User not found'));
        }

        if (!user.isActive || user.isBanned) {
          return next(new Error('Account is inactive or banned'));
        }

        socket.userId = decoded.userId;
        socket.user = user;
        next();
      } catch (error) {
        if (error.name === 'JsonWebTokenError') {
          return next(new Error('Invalid token'));
        }
        if (error.name === 'TokenExpiredError') {
          return next(new Error('Token expired'));
        }
        return next(new Error('Authentication failed'));
      }
    });

    this.io.on('connection', (socket) => {
      this._handleConnection(socket);
    });

    logger.info('SocketManager initialized');
    return this.io;
  }

  async _handleConnection(socket) {
    const userId = socket.userId;

    logger.debug(`Socket connected: ${socket.id} (user: ${userId})`);

    // Clear any pending disconnect timer for this user
    if (this.disconnectTimers.has(userId)) {
      clearTimeout(this.disconnectTimers.get(userId));
      this.disconnectTimers.delete(userId);
    }

    // Track socket mapping
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(socket.id);
    this.socketUsers.set(socket.id, userId);

    // Update user online status
    try {
      const User = require('../models/User');
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastSeen: new Date(),
      });
    } catch (error) {
      logger.error('Error updating user online status:', error);
    }

    // Join user's conversations
    try {
      const Conversation = require('../models/Conversation');
      if (Conversation) {
        const conversations = await Conversation.find({
          participants: userId,
          isActive: true,
        }).select('_id');

        conversations.forEach((conv) => {
          socket.join(`conversation:${conv._id}`);
        });

        logger.debug(`User ${userId} joined ${conversations.length} conversation rooms`);
      }
    } catch (error) {
      // Conversation model may not exist yet in Module 1
      logger.debug('Conversation model not available yet, skipping room joins');
    }

    // ─── Register Event Handlers ──────────────────────────────────

    this._registerMessageHandlers(socket, userId);
    this._registerTypingHandlers(socket, userId);

    // Handle disconnect
    socket.on('disconnect', () => {
      this._handleDisconnect(socket);
    });
  }

  // ─── Message Event Handlers ─────────────────────────────────────

  _registerMessageHandlers(socket, userId) {
    /**
     * Client sends a message via socket (alternative to REST API).
     * Payload: { conversationId, type, text, mediaUrl, mediaDuration, replyTo }
     */
    socket.on('message:send', async (payload, ack) => {
      try {
        const MessageService = require('../services/message.service');
        const { conversationId, type, text, mediaUrl, mediaDuration, replyTo } = payload;

        const result = await MessageService.sendMessage(userId, conversationId, {
          type: type || 'text',
          text,
          mediaUrl,
          mediaDuration,
          replyTo,
        });

        // Broadcast to conversation room (everyone including sender)
        this.emitToConversation(conversationId, 'message:new', result.message);

        // Also emit directly to recipient
        if (result.recipientId) {
          this.emitToUser(result.recipientId.toString(), 'message:new', result.message);
        }

        // Trigger push notification for offline recipient
        try {
          const NotificationService = require('../services/notification.service');
          if (result.recipientId && !this.isUserOnline(result.recipientId.toString())) {
            const User = require('../models/User');
            const sender = await User.findById(userId).select('firstName').lean();
            await NotificationService.notifyNewMessage(
              result.recipientId,
              sender?.firstName || 'Someone',
              result.message.content?.text || `New ${type} message`,
              conversationId
            );
          }
        } catch (_) {
          // Non-critical
        }

        // ACK back to sender
        if (typeof ack === 'function') {
          ack({ success: true, message: result.message });
        }
      } catch (error) {
        logger.error('Socket message:send error:', error.message);
        if (typeof ack === 'function') {
          ack({ success: false, error: error.message });
        }
      }
    });

    /**
     * Client marks a conversation as read.
     * Payload: { conversationId }
     */
    socket.on('message:read', async (payload, ack) => {
      try {
        const MessageService = require('../services/message.service');
        const { conversationId } = payload;

        const result = await MessageService.markAsRead(userId, conversationId);

        // Broadcast read receipt to conversation room
        this.emitToConversation(conversationId, 'message:read', {
          conversationId,
          readBy: userId,
          readAt: result.readAt,
          messagesRead: result.messagesRead,
        });

        if (typeof ack === 'function') {
          ack({ success: true, data: result });
        }
      } catch (error) {
        logger.error('Socket message:read error:', error.message);
        if (typeof ack === 'function') {
          ack({ success: false, error: error.message });
        }
      }
    });

    /**
     * Client adds a reaction to a message.
     * Payload: { messageId, emoji }
     */
    socket.on('message:reaction', async (payload, ack) => {
      try {
        const MessageService = require('../services/message.service');
        const { messageId, emoji } = payload;

        const result = await MessageService.addReaction(userId, messageId, emoji);

        // Broadcast reaction to conversation room
        this.emitToConversation(result.conversationId.toString(), 'message:reaction', {
          messageId: result.messageId,
          reactions: result.reactions,
          addedBy: userId,
          emoji,
        });

        if (typeof ack === 'function') {
          ack({ success: true, data: result });
        }
      } catch (error) {
        logger.error('Socket message:reaction error:', error.message);
        if (typeof ack === 'function') {
          ack({ success: false, error: error.message });
        }
      }
    });
  }

  // ─── Typing Indicator Handlers ──────────────────────────────────

  _registerTypingHandlers(socket, userId) {
    /**
     * Client started typing.
     * Payload: { conversationId }
     */
    socket.on('typing:start', (payload) => {
      const { conversationId } = payload;
      if (conversationId) {
        // Broadcast to everyone EXCEPT the sender
        socket.to(`conversation:${conversationId}`).emit('typing:start', {
          conversationId,
          userId,
        });
      }
    });

    /**
     * Client stopped typing.
     * Payload: { conversationId }
     */
    socket.on('typing:stop', (payload) => {
      const { conversationId } = payload;
      if (conversationId) {
        socket.to(`conversation:${conversationId}`).emit('typing:stop', {
          conversationId,
          userId,
        });
      }
    });
  }

  _handleDisconnect(socket) {
    const userId = socket.userId;

    logger.debug(`Socket disconnected: ${socket.id} (user: ${userId})`);

    // Remove socket from tracking
    this.socketUsers.delete(socket.id);

    if (this.userSockets.has(userId)) {
      this.userSockets.get(userId).delete(socket.id);

      // If user has no more active sockets, start grace period
      if (this.userSockets.get(userId).size === 0) {
        this.userSockets.delete(userId);

        // 30-second grace period before marking offline
        const timerId = setTimeout(async () => {
          this.disconnectTimers.delete(userId);

          // Double-check user hasn't reconnected
          if (!this.userSockets.has(userId)) {
            try {
              const User = require('../models/User');
              await User.findByIdAndUpdate(userId, {
                isOnline: false,
                lastSeen: new Date(),
              });
              logger.debug(`User ${userId} marked as offline after grace period`);
            } catch (error) {
              logger.error('Error updating user offline status:', error);
            }
          }
        }, 30000);

        this.disconnectTimers.set(userId, timerId);
      }
    }
  }

  /**
   * Emit an event to a specific user across all their connected sockets
   */
  emitToUser(userId, event, data) {
    const socketIds = this.userSockets.get(userId.toString());
    if (socketIds) {
      socketIds.forEach((socketId) => {
        this.io.to(socketId).emit(event, data);
      });
    }
  }

  /**
   * Emit an event to all participants of a conversation
   */
  emitToConversation(conversationId, event, data) {
    this.io.to(`conversation:${conversationId}`).emit(event, data);
  }

  /**
   * Check if a user is currently online
   */
  isUserOnline(userId) {
    const sockets = this.userSockets.get(userId.toString());
    return sockets ? sockets.size > 0 : false;
  }

  /**
   * Get the Socket.IO server instance
   */
  getIO() {
    return this.io;
  }
}

// Export singleton instance
const socketManager = new SocketManager();
module.exports = socketManager;
