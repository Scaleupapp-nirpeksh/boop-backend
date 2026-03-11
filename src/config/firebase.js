const admin = require('firebase-admin');
const logger = require('../utils/logger');

// MARK: - Firebase Configuration

let messaging = null;

/**
 * Initialize Firebase Admin SDK.
 * Falls back gracefully if not configured (development mode).
 */
const initializeFirebase = () => {
  try {
    // Check if required env vars are present
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      logger.warn(
        'Firebase not configured — push notifications disabled. ' +
          'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY to enable.'
      );
      return null;
    }

    // Initialize Firebase Admin (only once)
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          // Handle escaped newlines from .env
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    }

    messaging = admin.messaging();
    logger.info('Firebase Admin SDK initialized — push notifications enabled');

    return messaging;
  } catch (error) {
    logger.error('Firebase initialization failed:', error.message);
    return null;
  }
};

/**
 * Get the Firebase Messaging instance.
 * Returns null if Firebase is not configured.
 */
const getMessaging = () => {
  if (!messaging) {
    initializeFirebase();
  }
  return messaging;
};

module.exports = { initializeFirebase, getMessaging };
