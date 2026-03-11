const mongoose = require('mongoose');

const scoreSnapshotSchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true },
  comfortScore: { type: Number, min: 0, max: 100, required: true },
  dateReadinessScore: { type: Number, min: 0, max: 100, default: null },
  compatibilityScore: { type: Number, min: 0, max: 100, default: null },
  comfortBreakdown: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  trigger: { type: String, enum: ['message', 'game_complete', 'reveal', 'manual', 'periodic'], default: 'periodic' },
}, { timestamps: true });

scoreSnapshotSchema.index({ matchId: 1, createdAt: -1 });
// Only keep one snapshot per match per day to avoid bloat
scoreSnapshotSchema.index({ matchId: 1, createdAt: 1 });

const ScoreSnapshot = mongoose.model('ScoreSnapshot', scoreSnapshotSchema);
module.exports = ScoreSnapshot;
