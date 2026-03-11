const asyncHandler = require('../utils/asyncHandler');
const ProfileService = require('../services/profile.service');

/**
 * @desc    Get current user's profile
 * @route   GET /api/v1/profile
 * @access  Private
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await ProfileService.getProfile(req.user._id);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Profile retrieved successfully',
    data: { user },
  });
});

/**
 * @desc    Update basic profile info (name, DOB, gender, interests, bio, location)
 * @route   PUT /api/v1/profile/basic-info
 * @access  Private
 */
const updateBasicInfo = asyncHandler(async (req, res) => {
  const user = await ProfileService.updateBasicInfo(req.user._id, req.body);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Profile updated successfully',
    data: { user },
  });
});

/**
 * @desc    Upload voice intro recording
 * @route   POST /api/v1/profile/voice-intro
 * @access  Private
 */
const uploadVoiceIntro = asyncHandler(async (req, res) => {
  if (!req.file) {
    const error = new Error('Voice recording file is required');
    error.statusCode = 400;
    throw error;
  }

  const duration = req.body.duration ? parseFloat(req.body.duration) : 0;

  const user = await ProfileService.uploadVoiceIntro(
    req.user._id,
    req.file.buffer,
    req.file.originalname,
    duration
  );

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Voice intro uploaded successfully',
    data: { user },
  });
});

/**
 * @desc    Upload gallery photos (3-6 images)
 * @route   POST /api/v1/profile/photos
 * @access  Private
 */
const uploadPhotos = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    const error = new Error('At least one photo is required');
    error.statusCode = 400;
    throw error;
  }

  const user = await ProfileService.uploadPhotos(req.user._id, req.files);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: `${req.files.length} photo(s) uploaded successfully`,
    data: { user },
  });
});

/**
 * @desc    Delete a photo by index
 * @route   DELETE /api/v1/profile/photos/:index
 * @access  Private
 */
const deletePhoto = asyncHandler(async (req, res) => {
  const photoIndex = parseInt(req.params.index, 10);

  if (isNaN(photoIndex) || photoIndex < 0) {
    const error = new Error('Invalid photo index');
    error.statusCode = 400;
    throw error;
  }

  const user = await ProfileService.deletePhoto(req.user._id, photoIndex);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Photo deleted successfully',
    data: { user },
  });
});

/**
 * @desc    Reorder gallery photos and optionally choose the main profile photo
 * @route   PUT /api/v1/profile/photos/reorder
 * @access  Private
 */
const reorderPhotos = asyncHandler(async (req, res) => {
  const { orderedPhotoIds, mainPhotoId } = req.body;

  const user = await ProfileService.reorderPhotos(req.user._id, orderedPhotoIds, mainPhotoId);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Photos updated successfully',
    data: { user },
  });
});

/**
 * @desc    Update FCM push notification token
 * @route   PUT /api/v1/profile/fcm-token
 * @access  Private
 */
const updateFCMToken = asyncHandler(async (req, res) => {
  const { fcmToken } = req.body;

  if (!fcmToken || typeof fcmToken !== 'string') {
    const error = new Error('FCM token is required');
    error.statusCode = 400;
    throw error;
  }

  const User = require('../models/User');
  await User.findByIdAndUpdate(req.user._id, { fcmToken });

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'FCM token updated',
    data: null,
  });
});

/**
 * @desc    Update notification preferences
 * @route   PUT /api/v1/profile/notification-preferences
 * @access  Private
 */
const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const user = await ProfileService.updateNotificationPreferences(req.user._id, req.body);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Notification preferences updated',
    data: { user },
  });
});

module.exports = {
  getProfile,
  updateBasicInfo,
  uploadVoiceIntro,
  uploadPhotos,
  deletePhoto,
  reorderPhotos,
  updateFCMToken,
  updateNotificationPreferences,
};
