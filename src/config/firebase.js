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
    // Initialize Firebase Admin (only once)
    if (!admin.apps.length) {
      // Option 1: GOOGLE_APPLICATION_CREDENTIALS file path
      const credFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      // Option 2: Individual env vars
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY;

      if (credFile) {
        const serviceAccount = require(credFile);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      } else if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        });
      } else {
        logger.warn(
          'Firebase not configured — push notifications disabled. ' +
            'Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY.'
        );
        return null;
      }
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
