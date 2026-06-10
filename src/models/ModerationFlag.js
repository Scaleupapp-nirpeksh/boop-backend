const mongoose = require('mongoose');

const moderationFlagSchema = new mongoose.Schema(
  {
    // Intentionally narrower than Report's contentType — the AI moderation pipeline
    // only reviews messages and photos; profile reports come from users via Report.
    contentType: { type: String, enum: ['message', 'photo'], required: true },
    // Owner of the flagged content
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
    categories: [String],
    severe: { type: Boolean, default: false },
    autoHidden: { type: Boolean, default: false },
    excerpt: { type: String, maxlength: 300 },
    status: { type: String, enum: ['pending', 'dismissed', 'actioned'], default: 'pending' },
    reviewNote: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Moderation queue: fetch pending/actioned flags ordered by age
moderationFlagSchema.index({ status: 1, createdAt: -1 });
// Look up all flags raised against a specific user's content
moderationFlagSchema.index({ userId: 1 });

module.exports = mongoose.model('ModerationFlag', moderationFlagSchema);
