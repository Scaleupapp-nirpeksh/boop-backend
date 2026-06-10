const mongoose = require('mongoose');

const blockSchema = new mongoose.Schema(
  {
    blocker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    blocked: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Unique pair index: enforces one block per (blocker, blocked) and supports "is this user blocked?" lookups
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
// Look up everyone who has blocked a specific user (e.g. for feed filtering)
blockSchema.index({ blocked: 1 });

module.exports = mongoose.model('Block', blockSchema);
