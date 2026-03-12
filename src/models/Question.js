const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    // Unique question number (1–60)
    questionNumber: {
      type: Number,
      required: true,
      unique: true,
      min: 1,
      max: 200,
    },

    // Psychological dimension this question measures
    dimension: {
      type: String,
      required: true,
      enum: {
        values: [
          'emotional_vulnerability',
          'attachment_patterns',
          'life_vision',
          'conflict_resolution',
          'love_expression',
          'intimacy_comfort',
          'lifestyle_rhythm',
          'growth_mindset',
        ],
        message: '{VALUE} is not a valid dimension',
      },
    },

    // Depth level determines when the question is unlocked
    depthLevel: {
      type: String,
      required: true,
      enum: {
        values: ['surface', 'moderate', 'deep', 'vulnerable'],
        message: '{VALUE} is not a valid depth level',
      },
    },

    // The question itself
    questionText: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
    },

    // Type of response expected
    questionType: {
      type: String,
      required: true,
      enum: {
        values: ['text', 'single_choice', 'multiple_choice'],
        message: '{VALUE} is not a valid question type',
      },
    },

    // Options for choice-based questions
    options: {
      type: [String],
      default: [],
    },

    // Optional follow-up question (displayed after answering)
    followUpQuestion: {
      type: String,
      trim: true,
    },

    // Max characters for text answers
    characterLimit: {
      type: Number,
      default: 500,
    },

    // Day the question becomes available (1 = registration day)
    dayAvailable: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },

    // Display order within the same day
    order: {
      type: Number,
      required: true,
    },

    // Weight for scoring (higher = more impactful for matching)
    weight: {
      type: Number,
      default: 1.0,
      min: 0,
      max: 3.0,
    },

    // Prompt template for AI analysis of the answer
    analysisPrompt: {
      type: String,
      trim: true,
    },

    // Seasonal content (null = permanent, 'valentines_2026', etc.)
    season: {
      type: String,
      default: null,
      trim: true,
    },

    // Active flag (allows disabling questions without deleting)
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
questionSchema.index({ dayAvailable: 1, order: 1 });
questionSchema.index({ dimension: 1 });
questionSchema.index({ depthLevel: 1 });

const Question = mongoose.model('Question', questionSchema);

module.exports = Question;
