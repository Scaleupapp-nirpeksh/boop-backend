#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const { initializeFirebase } = require('../src/config/firebase');

async function main() {
  const messaging = initializeFirebase();
  if (messaging === null || messaging === undefined) {
    console.error('Firebase failed to initialize');
    process.exit(1);
  }
  console.log('Firebase initialized successfully');

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const user = await db.collection('users').findOne(
    { phone: '+918800237144' },
    { projection: { fcmToken: 1, firstName: 1 } }
  );

  if (user === null || user === undefined || user.fcmToken === undefined) {
    console.error('User not found or no FCM token');
    process.exit(1);
  }

  console.log('Sending test push to', user.firstName, '...');

  try {
    const result = await messaging.send({
      token: user.fcmToken,
      notification: {
        title: 'Boop is back! 🎉',
        body: 'Push notifications are now working. You will receive daily updates at 9AM, 11AM, and 6PM.',
      },
      data: {
        type: 'system',
        screen: 'home',
      },
      apns: {
        payload: {
          aps: { sound: 'default', badge: 1, 'mutable-content': 1, 'thread-id': 'system' },
        },
      },
    });
    console.log('Push sent successfully! Message ID:', result);
  } catch (err) {
    console.error('Push failed:', err.code, err.message);
  }

  process.exit(0);
}

main();
