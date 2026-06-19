#!/usr/bin/env node
/**
 * One-off: remove the App Store reviewer demo accounts (and all their traces)
 * now that the app is live, so real users don't encounter seeded fake profiles.
 * Usage: node scripts/cleanupReviewerDemo.js --confirm
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Answer = require('../src/models/Answer');
const Interaction = require('../src/models/Interaction');
const Match = require('../src/models/Match');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const Game = require('../src/models/Game');
const Notification = require('../src/models/Notification');
const ScoreSnapshot = require('../src/models/ScoreSnapshot');
const PersonalityAnalysis = require('../src/models/PersonalityAnalysis');
const UploadService = require('../src/services/upload.service');

const PHONES = ['+919000000007', '+919000000101', '+919000000102', '+919000000103'];

async function wipe(phone) {
  const u = await User.findOne({ phone }).lean();
  if (!u) { console.log(`  (not found) ${phone}`); return; }
  const uid = u._id;
  const matches = await Match.find({ users: uid }).select('_id').lean();
  const mIds = matches.map((m) => m._id);
  const convos = await Conversation.find({ $or: [{ matchId: { $in: mIds } }, { participants: uid }] }).select('_id').lean();
  const cIds = convos.map((c) => c._id);
  await Message.deleteMany({ $or: [{ conversationId: { $in: cIds } }, { senderId: uid }] });
  await Game.deleteMany({ $or: [{ matchId: { $in: mIds } }, { conversationId: { $in: cIds } }] });
  await ScoreSnapshot.deleteMany({ matchId: { $in: mIds } });
  await Conversation.deleteMany({ _id: { $in: cIds } });
  await Match.deleteMany({ _id: { $in: mIds } });
  await Interaction.deleteMany({ $or: [{ fromUser: uid }, { toUser: uid }] });
  await Notification.deleteMany({ userId: uid });
  await PersonalityAnalysis.deleteMany({ userId: uid });
  await Answer.deleteMany({ userId: uid });
  try { await UploadService.deleteAllUserMedia(uid.toString()); } catch (_) {}
  await User.deleteOne({ _id: uid });
  console.log(`  wiped ${phone} (${u.firstName || 'n/a'})`);
}

(async () => {
  if (!process.argv.includes('--confirm')) { console.error('ABORT: pass --confirm'); process.exit(1); }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected. Removing reviewer demo accounts...');
  for (const p of PHONES) await wipe(p);
  console.log('Done.');
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
