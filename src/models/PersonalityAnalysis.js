const mongoose = require('mongoose');

const personalityFacetSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    description: { type: String, required: true },
    emoji: { type: String, required: true },
  },
  { _id: false }
);

const numerologySchema = new mongoose.Schema(
  {
    lifePathNumber: { type: Number, required: true },
    expressionNumber: { type: Number },
    traits: [{ type: String }],
    description: { type: String },
  },
  { _id: false }
);

const personalityAnalysisSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    triggeredAtCount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    isPreliminary: {
      type: Boolean,
      default: true,
    },

    // Personality facets
    facets: [personalityFacetSchema],

    // Overall summary
    summary: { type: String },
    personalityType: { type: String },

    // Numerology
    numerology: numerologySchema,

    // Metadata
    questionsAnalyzed: { type: Number, default: 0 },
    modelUsed: { type: String },
    tokensUsed: { type: Number },
    errorMessage: { type: String },
  },
  {
    timestamps: true,
  }
);

personalityAnalysisSchema.index({ userId: 1, triggeredAtCount: -1 });
personalityAnalysisSchema.index({ userId: 1, status: 1 });

const PersonalityAnalysis = mongoose.model('PersonalityAnalysis', personalityAnalysisSchema);

module.exports = PersonalityAnalysis;
