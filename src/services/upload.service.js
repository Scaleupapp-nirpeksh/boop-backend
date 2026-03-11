const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { s3Client, S3_BUCKET, S3_BASE_URL } = require('../config/s3');
const logger = require('../utils/logger');

class UploadService {
  // ─── Core S3 Operations ─────────────────────────────────────────────────

  /**
   * Upload a buffer to S3
   * @param {Buffer} buffer - File buffer
   * @param {string} key - S3 object key (path)
   * @param {string} contentType - MIME type
   * @returns {{ url: string, s3Key: string }}
   */
  static async uploadToS3(buffer, key, contentType) {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);

    const url = `${S3_BASE_URL}/${key}`;
    logger.debug(`S3 upload: ${key} (${(buffer.length / 1024).toFixed(1)}KB)`);

    return { url, s3Key: key };
  }

  /**
   * Delete an object from S3
   * @param {string} s3Key - S3 object key
   */
  static async deleteFromS3(s3Key) {
    if (!s3Key) return;

    try {
      const command = new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
      });

      await s3Client.send(command);
      logger.debug(`S3 delete: ${s3Key}`);
    } catch (error) {
      logger.error(`S3 delete failed: ${s3Key}`, { error: error.message });
      // Don't throw — deletion failures shouldn't break user flow
    }
  }

  /**
   * Generate a presigned URL for temporary access
   * @param {string} s3Key - S3 object key
   * @param {number} expiresIn - Expiry in seconds (default: 1 hour)
   * @returns {string} Presigned URL
   */
  static async getPresignedUrl(s3Key, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  /**
   * Convert a stored S3 URL or key into an accessible URL.
   * This keeps the API usable even when the bucket is private.
   *
   * @param {string|null|undefined} urlOrKey
   * @param {number} expiresIn
   * @returns {Promise<string|null>}
   */
  static async getAccessibleUrl(urlOrKey, expiresIn = 3600) {
    if (!urlOrKey) return null;

    const s3Key = this._extractS3Key(urlOrKey);
    if (!s3Key) {
      return urlOrKey;
    }

    try {
      return await this.getPresignedUrl(s3Key, expiresIn);
    } catch (error) {
      logger.warn(`Could not sign asset URL for key ${s3Key}: ${error.message}`);
      return urlOrKey;
    }
  }

  /**
   * Best-effort media signing for nested profile photo payloads.
   *
   * @param {object|null|undefined} profilePhoto
   * @returns {Promise<object|null>}
   */
  static async signProfilePhoto(profilePhoto) {
    if (!profilePhoto) return null;

    const [url, blurredUrl, silhouetteUrl] = await Promise.all([
      this.getAccessibleUrl(profilePhoto.url || profilePhoto.s3Key || null),
      this.getAccessibleUrl(profilePhoto.blurredUrl || null),
      this.getAccessibleUrl(profilePhoto.silhouetteUrl || null),
    ]);

    return {
      ...profilePhoto,
      url,
      blurredUrl,
      silhouetteUrl,
    };
  }

  /**
   * Sign gallery items without mutating the original array.
   *
   * @param {Array<object>|null|undefined} items
   * @returns {Promise<Array<object>>}
   */
  static async signPhotoItems(items = []) {
    return Promise.all(
      (items || []).map(async (item) => ({
        ...item,
        url: await this.getAccessibleUrl(item.url || item.s3Key || null),
      }))
    );
  }

  // ─── Photo Processing ──────────────────────────────────────────────────

  /**
   * Process and upload a profile photo with blur + silhouette variants.
   * Called for the FIRST photo in a user's gallery (becomes their profile photo).
   *
   * @param {Buffer} buffer - Raw image buffer
   * @param {string} userId - User ID
   * @returns {{ url, s3Key, blurredUrl, silhouetteUrl }}
   */
  static async processProfilePhoto(buffer, userId) {
    const id = uuidv4().slice(0, 8);
    const basePath = `users/${userId}/profile`;

    // 1. Original — resize to max 800px, convert to webp
    const originalBuffer = await sharp(buffer)
      .resize(800, 800, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();

    // 2. Blurred — heavy blur for mystery phase
    const blurredBuffer = await sharp(buffer)
      .resize(800, 800, { fit: 'cover' })
      .blur(30)
      .webp({ quality: 70 })
      .toBuffer();

    // 3. Silhouette — grayscale + extreme blur + darken for discovery phase
    const silhouetteBuffer = await sharp(buffer)
      .resize(800, 800, { fit: 'cover' })
      .grayscale()
      .blur(50)
      .modulate({ brightness: 0.4 })
      .webp({ quality: 60 })
      .toBuffer();

    // Upload all three in parallel
    const [original, blurred, silhouette] = await Promise.all([
      this.uploadToS3(originalBuffer, `${basePath}/original-${id}.webp`, 'image/webp'),
      this.uploadToS3(blurredBuffer, `${basePath}/blurred-${id}.webp`, 'image/webp'),
      this.uploadToS3(silhouetteBuffer, `${basePath}/silhouette-${id}.webp`, 'image/webp'),
    ]);

    logger.info(`Profile photo processed for user ${userId}`, {
      originalSize: `${(originalBuffer.length / 1024).toFixed(0)}KB`,
    });

    return {
      url: original.url,
      s3Key: original.s3Key,
      blurredUrl: blurred.url,
      silhouetteUrl: silhouette.url,
    };
  }

  /**
   * Process and upload a gallery photo.
   * Resizes to max 1200px wide, converts to webp.
   *
   * @param {Buffer} buffer - Raw image buffer
   * @param {string} userId - User ID
   * @param {number} order - Photo order index (0-5)
   * @returns {{ url, s3Key }}
   */
  static async processGalleryPhoto(buffer, userId, order) {
    const id = uuidv4().slice(0, 8);
    const key = `users/${userId}/gallery/photo-${order}-${id}.webp`;

    const processedBuffer = await sharp(buffer)
      .resize(1200, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    const result = await this.uploadToS3(processedBuffer, key, 'image/webp');

    logger.debug(`Gallery photo ${order} uploaded for user ${userId}`);
    return result;
  }

  // ─── Voice Intro ───────────────────────────────────────────────────────

  /**
   * Upload a voice intro recording to S3.
   * Stores as-is (no server-side audio processing).
   *
   * @param {Buffer} buffer - Audio buffer
   * @param {string} userId - User ID
   * @param {string} originalName - Original filename for extension detection
   * @returns {{ url, s3Key }}
   */
  static async uploadVoiceIntro(buffer, userId, originalName) {
    const id = uuidv4().slice(0, 8);

    // Determine extension from original filename or default to m4a
    const ext = originalName
      ? originalName.split('.').pop().toLowerCase()
      : 'm4a';
    const contentType = this._getAudioContentType(ext);

    const key = `users/${userId}/voice/intro-${id}.${ext}`;
    const result = await this.uploadToS3(buffer, key, contentType);

    logger.info(`Voice intro uploaded for user ${userId} (${(buffer.length / 1024).toFixed(0)}KB)`);
    return result;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  /**
   * Clean up old S3 objects when replacing (profile photo, voice intro, etc.)
   * @param {string[]} s3Keys - Array of S3 keys to delete
   */
  static async cleanupOldFiles(s3Keys) {
    const validKeys = s3Keys.filter(Boolean);
    if (validKeys.length === 0) return;

    await Promise.allSettled(
      validKeys.map((key) => this.deleteFromS3(key))
    );

    logger.debug(`Cleaned up ${validKeys.length} old S3 objects`);
  }

  /**
   * Map file extension to audio MIME type
   * @private
   */
  static _getAudioContentType(ext) {
    const map = {
      m4a: 'audio/mp4',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      aac: 'audio/aac',
      ogg: 'audio/ogg',
      webm: 'audio/webm',
    };
    return map[ext] || 'audio/mp4';
  }

  /**
   * Extract an S3 object key from either a stored key or a full S3 URL.
   * @private
   */
  static _extractS3Key(urlOrKey) {
    if (!urlOrKey || typeof urlOrKey !== 'string') return null;

    if (!urlOrKey.startsWith('http://') && !urlOrKey.startsWith('https://')) {
      return urlOrKey;
    }

    if (!urlOrKey.startsWith(S3_BASE_URL)) {
      return null;
    }

    const path = urlOrKey.slice(S3_BASE_URL.length).replace(/^\/+/, '');
    return path || null;
  }
}

module.exports = UploadService;
