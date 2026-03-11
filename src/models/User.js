const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    // Authentication
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^\+[1-9]\d{1,14}$/.test(v);
        },
        message: 'Phone number must be in E.164 format (e.g., +919876543210)',
      },
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },

    // Basic Profile
    firstName: {
      type: String,
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    dateOfBirth: {
      type: Date,
    },
    gender: {
      type: String,
      enum: {
        values: ['male', 'female', 'non-binary', 'other'],
        message: '{VALUE} is not a valid gender option',
      },
    },
    interestedIn: {
      type: String,
      enum: {
        values: ['men', 'women', 'everyone'],
        message: '{VALUE} is not a valid interest preference',
      },
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      validate: {
        validator: function (v) {
          return /^[a-zA-Z0-9._]+$/.test(v);
        },
        message: 'Username can only contain letters, numbers, dots, and underscores',
      },
    },

    // Location
    location: {
      city: { type: String, trim: true },
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: '2dsphere',
      },
    },

    // Bio
    bio: {
      text: {
        type: String,
        maxlength: [500, 'Bio cannot exceed 500 characters'],
      },
      audioUrl: String,
      audioDuration: Number,
      transcription: String,
    },

    // Voice Intro
    voiceIntro: {
      audioUrl: String,
      s3Key: String,
      duration: {
        type: Number,
        max: [60, 'Voice intro cannot exceed 60 seconds'],
      },
      transcription: String,
      createdAt: Date,
    },

    // Photos
    photos: {
      items: {
        type: [
          {
            url: { type: String, required: true },
            s3Key: String,
            order: { type: Number, required: true },
            uploadedAt: { type: Date, default: Date.now },
          },
        ],
        validate: {
          validator: function (v) {
            return v.length <= 6;
          },
          message: 'Maximum 6 photos allowed',
        },
        default: [],
      },
      profilePhoto: {
        url: String,
        s3Key: String,
        blurredUrl: String,
        silhouetteUrl: String,
      },
      totalPhotos: {
        type: Number,
        default: 0,
      },
    },

    // Profile Progress
    questionsAnswered: {
      type: Number,
      default: 0,
    },
    profileStage: {
      type: String,
      enum: {
        values: ['incomplete', 'voice_pending', 'questions_pending', 'ready'],
        message: '{VALUE} is not a valid profile stage',
      },
      default: 'incomplete',
    },

    // Premium
    isPremium: {
      type: Boolean,
      default: false,
    },
    premiumExpiry: {
      type: Date,
    },

    // Account Status
    isActive: {
      type: Boolean,
      default: true,
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    banReason: {
      type: String,
    },

    // Online Status
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },

    // Push Notifications
    fcmToken: {
      type: String,
    },
    notificationPreferences: {
      allMuted: { type: Boolean, default: false },
      quietHoursStart: { type: String }, // e.g., "22:00"
      quietHoursEnd: { type: String }, // e.g., "07:00"
      timezone: { type: String, default: 'Asia/Kolkata' },
      mutedTypes: [{ type: String, enum: ['new_match', 'new_message', 'game_invite', 'reveal_request', 'photos_revealed', 'stage_advanced', 'like_received', 'questions_reminder'] }],
    },

    // Auth (hashed refresh token stored for validation)
    refreshToken: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
// phone: unique index is created by `unique: true` in schema definition
// username: unique sparse index is created by `unique: true, sparse: true` in schema definition
// location.coordinates: 2dsphere index is created by `index: '2dsphere'` in schema definition
// Additional composite indexes can be added here as needed
userSchema.index({ isActive: 1, isBanned: 1 });
userSchema.index({ profileStage: 1 });

// JSON transform — hide sensitive fields
userSchema.set('toJSON', {
  transform: function (doc, ret) {
    delete ret.refreshToken;
    delete ret.__v;
    return ret;
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
