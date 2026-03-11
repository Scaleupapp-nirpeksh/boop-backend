const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema(
  {
    // Who answered
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },

    // Which question
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: [true, 'Question ID is required'],
    },

    // Quick lookup without populating
    questionNumber: {
      type: Number,
      required: true,
    },

    // Text-based answer (for 'text' type questions)
    textAnswer: {
      type: String,
      trim: true,
      maxlength: [500, 'Answer cannot exceed 500 characters'],
    },

    // Single choice answer
    selectedOption: {
      type: String,
      trim: true,
    },

    // Multiple choice answers
    selectedOptions: {
      type: [String],
      default: [],
    },

    // Answer to the follow-up question (if any)
    followUpAnswer: {
      type: String,
      trim: true,
      maxlength: [300, 'Follow-up answer cannot exceed 300 characters'],
    },

    // Voice answer audio URL (S3)
    voiceAnswerUrl: {
      type: String,
      default: null,
    },

    // Voice answer S3 key (for cleanup)
    voiceAnswerS3Key: {
      type: String,
      default: null,
    },

    // Whether transcription is pending
    transcriptionPending: {
      type: Boolean,
      default: false,
    },

    // How long the user spent on this question (seconds)
    timeSpent: {
      type: Number,
      default: 0,
    },

    // OpenAI text-embedding-3-small vector for text answers
    embedding: {
      type: [Number],
      default: null,
      select: false, // Excluded from default queries (1536 floats)
    },

    // When the answer was submitted
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Each user can only answer each question once
answerSchema.index({ userId: 1, questionNumber: 1 }, { unique: true });
answerSchema.index({ userId: 1, questionId: 1 }, { unique: true });

const Answer = mongoose.model('Answer', answerSchema);

module.exports = Answer;
