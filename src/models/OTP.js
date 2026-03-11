const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'OTP code is required'],
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiry date is required'],
  },
  attempts: {
    type: Number,
    default: 0,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// TTL index — MongoDB automatically deletes documents after expiresAt
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for efficient phone-based lookups
otpSchema.index({ phone: 1, isVerified: 1 });

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP;
