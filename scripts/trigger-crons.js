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
  console.log('Firebase initialized\n');

  await mongoose.connect(process.env.MONGODB_URI);

  const QuestionReminderService = require('../src/services/questionReminder.service');

  console.log('=== Triggering 9 AM Morning Digest ===');
  await QuestionReminderService.sendMorningDigest();

  console.log('\n=== Triggering 11 AM Question Reminders ===');
  await QuestionReminderService.sendDailyReminders();

  console.log('\nDone. Check your phone!');
  process.exit(0);
}

main();
