const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { uploadVoiceIntro, uploadGalleryPhotos } = require('../middleware/upload.middleware');
const {
  validate,
  updateBasicInfoSchema,
  reorderPhotosSchema,
  notificationPreferencesSchema,
} = require('../validators/profile.validator');

// All profile routes require authentication
router.use(authenticate);

// GET /profile — Get current user's profile
router.get('/', profileController.getProfile);

// PUT /profile/basic-info — Update basic info (batch: name, DOB, gender, interests, bio, location)
router.put('/basic-info', validate(updateBasicInfoSchema), profileController.updateBasicInfo);

// POST /profile/voice-intro — Upload voice intro (multipart: voiceIntro file + duration field)
router.post('/voice-intro', uploadVoiceIntro, profileController.uploadVoiceIntro);

// POST /profile/photos — Upload gallery photos (multipart: photos[] array)
router.post('/photos', uploadGalleryPhotos, profileController.uploadPhotos);

// PUT /profile/photos/reorder — Reorder photos and optionally set the main photo
router.put('/photos/reorder', validate(reorderPhotosSchema), profileController.reorderPhotos);

// DELETE /profile/photos/:index — Delete a photo by index
router.delete('/photos/:index', profileController.deletePhoto);

// PUT /profile/fcm-token — Update FCM push notification token
router.put('/fcm-token', profileController.updateFCMToken);

// PUT /profile/notification-preferences — Update mute / quiet-hour preferences
router.put(
  '/notification-preferences',
  validate(notificationPreferencesSchema),
  profileController.updateNotificationPreferences
);

module.exports = router;
