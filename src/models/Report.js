const mongoose = require('mongoose');
const { REPORT_REASONS } = require('../utils/constants');

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reported: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, maxlength: 1000 },
    contentType: { type: String, enum: ['profile', 'message', 'photo'], default: 'profile' },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    status: { type: String, enum: ['pending', 'dismissed', 'actioned'], default: 'pending' },
    reviewNote: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Moderation queue: fetch pending/actioned reports ordered by age
reportSchema.index({ status: 1, createdAt: -1 });
// Look up all reports made against a specific user
reportSchema.index({ reported: 1 });
// Duplicate-report guard: check whether a user has already reported someone
reportSchema.index({ reporter: 1, reported: 1 });

module.exports = mongoose.model('Report', reportSchema);
