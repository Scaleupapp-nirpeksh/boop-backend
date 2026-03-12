const mongoose = require('mongoose');

const datePlanSchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
  proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['proposed', 'accepted', 'declined', 'completed', 'cancelled'],
    default: 'proposed',
  },

  // Venue
  venue: {
    name: { type: String, required: true },
    type: { type: String, enum: ['coffee', 'dinner', 'activity', 'walk', 'drinks', 'other'], default: 'coffee' },
    address: String,
    coordinates: [Number],
  },

  proposedDate: { type: Date, required: true },
  proposedTime: { type: String },
  notes: { type: String, maxlength: 500 },

  // Response
  acceptedAt: Date,
  declinedAt: Date,
  declineReason: String,
  completedAt: Date,

  // Safety (5B)
  safetyContact: {
    name: String,
    phone: String,
  },
  locationSharing: {
    enabled: { type: Boolean, default: false },
    enabledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    startedAt: Date,
    expiresAt: Date,
  },
  checkIns: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['ok', 'help'], required: true },
    timestamp: { type: Date, default: Date.now },
    location: {
      coordinates: [Number],
    },
  }],
}, { timestamps: true });

datePlanSchema.index({ matchId: 1, createdAt: -1 });
datePlanSchema.index({ proposedBy: 1 });
datePlanSchema.index({ status: 1 });

module.exports = mongoose.model('DatePlan', datePlanSchema);
