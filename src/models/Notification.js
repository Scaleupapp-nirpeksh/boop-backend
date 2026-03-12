const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['new_match', 'new_message', 'game_invite', 'reveal_request', 'photos_revealed', 'stage_advanced', 'like_received', 'questions_reminder', 'boop', 'streak_milestone', 'daily_digest', 'streak_warning', 'connection_nudge', 'badge_earned', 'date_proposed', 'date_accepted', 'date_declined', 'system'],
    required: true
  },
  title: { type: String, required: true },
  body: { type: String, required: true },
  data: {
    matchId: String,
    conversationId: String,
    gameId: String,
    senderId: String,
    senderName: String,
    badgeKey: String,
  },
  read: { type: Boolean, default: false },
  pushSent: { type: Boolean, default: false },
  pushError: String,
}, { timestamps: true });

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
