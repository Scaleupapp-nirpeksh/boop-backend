const User = require('../models/User');
const UploadService = require('./upload.service');
const TranscriptionService = require('./transcription.service');
const logger = require('../utils/logger');

class ProfileService {
  // ─── Get Profile ──────────────────────────────────────────────────────

  /**
   * Get the current user's full profile.
   * @param {string} userId
   * @returns {User}
   */
  static async getProfile(userId) {
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const profileObject = user.toObject();
    profileObject.voiceIntro = profileObject.voiceIntro || {};
    profileObject.photos = profileObject.photos || { items: [], totalPhotos: 0 };
    profileObject.voiceIntro.audioUrl = await UploadService.getAccessibleUrl(
      profileObject.voiceIntro.audioUrl || profileObject.voiceIntro.s3Key || null
    );
    profileObject.photos.profilePhoto = await UploadService.signProfilePhoto(
      profileObject.photos.profilePhoto
    );
    profileObject.photos.items = await UploadService.signPhotoItems(
      profileObject.photos.items
    );

    return profileObject;
  }

  // ─── Update Basic Info ────────────────────────────────────────────────

  /**
   * Update basic profile fields (name, DOB, gender, interests, bio, location).
   * Validates user is 18+ and advances profile stage to 'voice_pending'.
   *
   * @param {string} userId
   * @param {object} data - { firstName, dateOfBirth, gender, interestedIn, bio?, location? }
   * @returns {User} Updated user
   */
  static async updateBasicInfo(userId, data) {
    const updateFields = {};

    // Core fields — only set if provided
    if (data.dateOfBirth) {
      const dob = new Date(data.dateOfBirth);
      const age = this._calculateAge(dob);
      if (age < 18) {
        const error = new Error('You must be at least 18 years old to use Boop');
        error.statusCode = 400;
        throw error;
      }
      updateFields.dateOfBirth = dob;
    }

    if (data.firstName) updateFields.firstName = data.firstName;
    if (data.gender) updateFields.gender = data.gender;
    if (data.interestedIn) updateFields.interestedIn = data.interestedIn;

    // Optional fields
    if (data.bio !== undefined) {
      updateFields['bio.text'] = data.bio;
    }

    if (data.location) {
      if (data.location.city) {
        updateFields['location.city'] = data.location.city;
      }
      if (data.location.coordinates) {
        updateFields['location.coordinates'] = data.location.coordinates;
      }
    }

    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Apply updates (skip undefined/null values)
    Object.keys(updateFields).forEach((key) => {
      if (updateFields[key] === undefined || updateFields[key] === null) return;
      // Handle nested dot-notation keys
      const keys = key.split('.');
      if (keys.length === 1) {
        user[key] = updateFields[key];
      } else {
        // e.g., 'bio.text' → user.bio.text
        let obj = user;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!obj[keys[i]]) obj[keys[i]] = {};
          obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = updateFields[key];
      }
    });

    // Advance stage: incomplete → voice_pending
    if (user.profileStage === 'incomplete') {
      user.profileStage = 'voice_pending';
      logger.info(`User ${userId} stage: incomplete → voice_pending`);
    }

    await user.save();
    return user;
  }

  // ─── Voice Intro ──────────────────────────────────────────────────────

  /**
   * Upload a voice intro recording.
   * Cleans up any existing recording first, then fires off transcription async.
   *
   * @param {string} userId
   * @param {Buffer} buffer - Audio buffer
   * @param {string} originalName - Original filename
   * @param {number} duration - Duration in seconds (from client)
   * @returns {User} Updated user
   */
  static async uploadVoiceIntro(userId, buffer, originalName, duration) {
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Validate duration: 10–60 seconds
    if (duration && (duration < 10 || duration > 60)) {
      const error = new Error('Voice intro must be between 10 and 60 seconds');
      error.statusCode = 400;
      throw error;
    }

    // Clean up old voice intro if exists
    if (user.voiceIntro?.s3Key) {
      await UploadService.deleteFromS3(user.voiceIntro.s3Key);
    }

    // Upload to S3
    const { url, s3Key } = await UploadService.uploadVoiceIntro(buffer, userId, originalName);

    // Update user
    user.voiceIntro = {
      audioUrl: url,
      s3Key,
      duration: duration || 0,
      transcription: null,
      createdAt: new Date(),
    };

    // Check if we should advance stage
    await this._checkAndAdvanceStage(user);
    await user.save();

    // Fire-and-forget transcription
    TranscriptionService.transcribeVoiceIntro(userId, buffer, originalName);

    // Check for new badges
    try {
      const { BadgeService } = require('./badge.service');
      BadgeService.checkAndAwardBadges(userId).catch(() => {});
    } catch {
      // Non-critical
    }

    logger.info(`Voice intro uploaded for user ${userId} (${duration}s)`);
    return user;
  }

  // ─── Photo Upload ─────────────────────────────────────────────────────

  /**
   * Upload gallery photos (3–6 images).
   * The first photo is also processed as the profile photo (blur + silhouette).
   *
   * @param {string} userId
   * @param {Array<{ buffer: Buffer, originalname: string }>} files - Multer files
   * @returns {User} Updated user
   */
  static async uploadPhotos(userId, files) {
    if (!files || files.length === 0) {
      const error = new Error('At least one photo is required');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const currentCount = user.photos?.items?.length || 0;
    if (currentCount + files.length > 6) {
      const error = new Error(`Too many photos. You have ${currentCount}, can add up to ${6 - currentCount} more`);
      error.statusCode = 400;
      throw error;
    }

    // Process all gallery photos in parallel
    const uploadPromises = files.map((file, index) => {
      const order = currentCount + index;
      return UploadService.processGalleryPhoto(file.buffer, userId, order);
    });

    const uploadedPhotos = await Promise.all(uploadPromises);

    // Build photo items
    const newItems = uploadedPhotos.map((photo, index) => ({
      url: photo.url,
      s3Key: photo.s3Key,
      order: currentCount + index,
      uploadedAt: new Date(),
    }));

    // If this is the first batch (no existing photos), also create profile photo
    if (currentCount === 0 && files.length > 0) {
      const profilePhotoResult = await UploadService.processProfilePhoto(
        files[0].buffer,
        userId
      );

      user.photos.profilePhoto = {
        url: profilePhotoResult.url,
        s3Key: profilePhotoResult.s3Key,
        blurredUrl: profilePhotoResult.blurredUrl,
        silhouetteUrl: profilePhotoResult.silhouetteUrl,
      };
    }

    // Append new items
    if (!user.photos.items) user.photos.items = [];
    user.photos.items.push(...newItems);
    user.photos.totalPhotos = user.photos.items.length;

    // Check stage advancement
    await this._checkAndAdvanceStage(user);
    await user.save();

    logger.info(`${files.length} photos uploaded for user ${userId} (total: ${user.photos.totalPhotos})`);
    return user;
  }

  // ─── Delete Photo ─────────────────────────────────────────────────────

  /**
   * Delete a photo by its index in the gallery.
   * Enforces minimum of 3 photos if profile stage is beyond voice_pending.
   *
   * @param {string} userId
   * @param {number} photoIndex - Index of photo in items array
   * @returns {User} Updated user
   */
  static async deletePhoto(userId, photoIndex) {
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const items = user.photos?.items || [];
    if (photoIndex < 0 || photoIndex >= items.length) {
      const error = new Error('Photo not found at that index');
      error.statusCode = 404;
      throw error;
    }

    // Enforce minimum if profile is past voice_pending
    if (['questions_pending', 'ready'].includes(user.profileStage) && items.length <= 3) {
      const error = new Error('You must have at least 3 photos');
      error.statusCode = 400;
      throw error;
    }

    // Get the photo to delete
    const photo = items[photoIndex];

    // Delete from S3
    await UploadService.deleteFromS3(photo.s3Key);

    // Remove from array
    items.splice(photoIndex, 1);

    // Reorder remaining items
    items.forEach((item, i) => {
      item.order = i;
    });

    user.photos.items = items;
    user.photos.totalPhotos = items.length;

    // If we deleted the first photo (profile photo), re-process from new first
    if (photoIndex === 0 && items.length > 0) {
      // Clean up old profile photo S3 objects
      const oldProfile = user.photos.profilePhoto;
      await UploadService.cleanupOldFiles([
        oldProfile?.s3Key,
        // blurred & silhouette S3 keys are not stored separately — they're just URLs
        // We'd need to extract keys from URLs or store them. For now, the old ones
        // will remain as orphans (can clean up with a cron job later).
      ]);

      // We can't reprocess from stored photo because we only have the URL, not the buffer.
      // In production you'd fetch from S3 + reprocess. For now, set profile from the new first item.
      user.photos.profilePhoto = {
        url: items[0].url,
        s3Key: items[0].s3Key,
        blurredUrl: user.photos.profilePhoto?.blurredUrl || null,
        silhouetteUrl: user.photos.profilePhoto?.silhouetteUrl || null,
      };
    } else if (items.length === 0) {
      user.photos.profilePhoto = {};
    }

    await user.save();

    logger.info(`Photo ${photoIndex} deleted for user ${userId} (remaining: ${items.length})`);
    return user;
  }

  // ─── Reorder Photos ───────────────────────────────────────────────────

  /**
   * Reorder gallery photos and optionally select a main photo.
   *
   * @param {string} userId
   * @param {string[]} orderedPhotoIds
   * @param {string|null} mainPhotoId
   * @returns {User}
   */
  static async reorderPhotos(userId, orderedPhotoIds, mainPhotoId = null) {
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const items = user.photos?.items || [];
    if (!items.length) {
      const error = new Error('No photos available to reorder');
      error.statusCode = 400;
      throw error;
    }

    if (!Array.isArray(orderedPhotoIds) || orderedPhotoIds.length !== items.length) {
      const error = new Error('orderedPhotoIds must include every current photo exactly once');
      error.statusCode = 400;
      throw error;
    }

    const photoIdFor = (item) => item.s3Key || item.url;
    const photoMap = new Map(items.map((item) => [photoIdFor(item), item]));

    if (new Set(orderedPhotoIds).size !== orderedPhotoIds.length) {
      const error = new Error('orderedPhotoIds contains duplicates');
      error.statusCode = 400;
      throw error;
    }

    const reordered = orderedPhotoIds.map((photoId) => {
      const item = photoMap.get(photoId);
      if (!item) {
        const error = new Error('orderedPhotoIds contains an unknown photo');
        error.statusCode = 400;
        throw error;
      }
      return item.toObject ? item.toObject() : { ...item };
    });

    let orderedItems = reordered;
    if (mainPhotoId) {
      const mainIndex = reordered.findIndex((item) => photoIdFor(item) === mainPhotoId);
      if (mainIndex == -1) {
        const error = new Error('mainPhotoId does not match a current photo');
        error.statusCode = 400;
        throw error;
      }

      const [mainItem] = orderedItems.splice(mainIndex, 1);
      orderedItems.unshift(mainItem);
    }

    orderedItems = orderedItems.map((item, index) => ({
      ...item,
      order: index,
    }));

    user.photos.items = orderedItems;
    user.photos.totalPhotos = orderedItems.length;

    const selectedMain = orderedItems[0];
    const previousMainId = user.photos?.profilePhoto?.s3Key || user.photos?.profilePhoto?.url;
    const selectedMainId = photoIdFor(selectedMain);
    const preservesDerivedAssets = previousMainId === selectedMainId;

    if (preservesDerivedAssets) {
      user.photos.profilePhoto = {
        url: selectedMain.url,
        s3Key: selectedMain.s3Key,
        blurredUrl: user.photos.profilePhoto?.blurredUrl || null,
        silhouetteUrl: user.photos.profilePhoto?.silhouetteUrl || null,
      };
    } else {
      const previousProfilePhoto = user.photos.profilePhoto;
      const profilePhotoResult = await this._rebuildProfilePhotoFromGalleryItem(selectedMain, userId);

      user.photos.profilePhoto = {
        url: profilePhotoResult.url,
        s3Key: profilePhotoResult.s3Key,
        blurredUrl: profilePhotoResult.blurredUrl,
        silhouetteUrl: profilePhotoResult.silhouetteUrl,
      };

      await UploadService.cleanupOldFiles([previousProfilePhoto?.s3Key]);
    }

    await user.save();

    logger.info(`Photos reordered for user ${userId}; main photo set to ${selectedMainId}`);
    return user;
  }

  // ─── Notification Preferences ─────────────────────────────────────────

  static async updateNotificationPreferences(userId, preferences) {
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    user.notificationPreferences = {
      ...user.notificationPreferences?.toObject?.(),
      ...user.notificationPreferences,
      ...(preferences.allMuted !== undefined ? { allMuted: preferences.allMuted } : {}),
      ...(preferences.timezone ? { timezone: preferences.timezone } : {}),
      quietHoursStart: preferences.quietHoursStart || undefined,
      quietHoursEnd: preferences.quietHoursEnd || undefined,
    };

    await user.save();
    logger.info(`Notification preferences updated for user ${userId}`);
    return user;
  }

  // ─── Stage Management ─────────────────────────────────────────────────

  /**
   * Check if user qualifies for a stage advancement and apply it.
   * @private
   * @param {User} user - Mongoose user document (mutated in place)
   */
  static async _checkAndAdvanceStage(user) {
    const hasVoice = !!user.voiceIntro?.audioUrl;
    const photoCount = user.photos?.items?.length || 0;
    const hasMinPhotos = photoCount >= 3;
    const answeredCount = user.questionsAnswered || 0;

    // voice_pending → questions_pending (voice recorded + 3+ photos)
    if (user.profileStage === 'voice_pending' && hasVoice && hasMinPhotos) {
      user.profileStage = 'questions_pending';
      logger.info(`User ${user._id} stage: voice_pending → questions_pending`);
    }

    // questions_pending → ready (15+ questions answered)
    if (user.profileStage === 'questions_pending' && answeredCount >= 15) {
      user.profileStage = 'ready';
      logger.info(`User ${user._id} stage: questions_pending → ready`);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  /**
   * Calculate age from date of birth
   * @private
   */
  static _calculateAge(dob) {
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  static async _rebuildProfilePhotoFromGalleryItem(item, userId) {
    const response = await fetch(item.url);
    if (!response.ok) {
      const error = new Error('Could not fetch selected photo for profile processing');
      error.statusCode = 500;
      throw error;
    }

    const arrayBuffer = await response.arrayBuffer();
    return UploadService.processProfilePhoto(Buffer.from(arrayBuffer), userId);
  }
}

module.exports = ProfileService;
