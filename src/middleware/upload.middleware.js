const multer = require('multer');
const logger = require('../utils/logger');

// ─── Storage ────────────────────────────────────────────────────────────────
// Memory storage so we can process files with Sharp before uploading to S3
const storage = multer.memoryStorage();

// ─── File Filters ───────────────────────────────────────────────────────────

const imageFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error(`Invalid image type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, HEIC`);
    error.statusCode = 400;
    cb(error, false);
  }
};

const audioFilter = (req, file, cb) => {
  const allowedMimes = [
    'audio/m4a',
    'audio/x-m4a',
    'audio/mp4',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/aac',
    'audio/ogg',
    'audio/webm',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error(`Invalid audio type: ${file.mimetype}. Allowed: M4A, MP3, WAV, AAC, OGG, WebM`);
    error.statusCode = 400;
    cb(error, false);
  }
};

const chatMediaFilter = (req, file, cb) => {
  const imageMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ];
  const audioMimes = [
    'audio/m4a',
    'audio/x-m4a',
    'audio/mp4',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/aac',
    'audio/ogg',
    'audio/webm',
  ];

  if ([...imageMimes, ...audioMimes].includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error(`Invalid media type: ${file.mimetype}`);
    error.statusCode = 400;
    cb(error, false);
  }
};

// ─── Upload Middleware Factories ─────────────────────────────────────────────

/**
 * Voice intro upload — single file, max 10MB
 */
const uploadVoiceIntro = multer({
  storage,
  fileFilter: audioFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
  },
}).single('voiceIntro');

/**
 * Gallery photos upload — up to 6 images, max 5MB each
 */
const uploadGalleryPhotos = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 6,
  },
}).array('photos', 6);

/**
 * Single photo upload — 1 image, max 5MB
 */
const uploadSinglePhoto = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
}).single('photo');

// ─── Error Wrapper ──────────────────────────────────────────────────────────
// Wraps multer middleware to catch MulterErrors and pass them to Express error handler

const wrapMulter = (multerMiddleware) => {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) {
        logger.warn(`Upload error: ${err.message}`, { code: err.code });

        if (err instanceof multer.MulterError) {
          // Multer-specific errors are handled by our global errorHandler
          return next(err);
        }

        // Custom file filter errors
        return next(err);
      }
      next();
    });
  };
};

/**
 * Voice answer upload — single audio file, max 10MB
 */
const uploadVoiceAnswer = multer({
  storage,
  fileFilter: audioFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
}).single('voiceAnswer');

const uploadMessageMedia = multer({
  storage,
  fileFilter: chatMediaFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
}).single('file');

module.exports = {
  uploadVoiceIntro: wrapMulter(uploadVoiceIntro),
  uploadVoiceAnswer: wrapMulter(uploadVoiceAnswer),
  uploadGalleryPhotos: wrapMulter(uploadGalleryPhotos),
  uploadSinglePhoto: wrapMulter(uploadSinglePhoto),
  uploadMessageMedia: wrapMulter(uploadMessageMedia),
};
