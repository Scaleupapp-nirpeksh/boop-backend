#!/usr/bin/env node
/**
 * Seed the App Store REVIEW demo account (+919000000007) into a complete,
 * navigable state: a ready male profile (Arjun) interested in women, three
 * ready female profiles (photos + answers + voice intros), and two pre-made
 * matches with conversations so reviewers see Discover, Matches and Chat
 * working. Leaves one woman unmatched so Discover is populated.
 *
 * Idempotent: wipes the reviewer + the three demo women (and all their traces)
 * before recreating.
 *
 * Usage: node scripts/seedReviewer.js --confirm
 */
require('dotenv').config();
const mongoose = require('mongoose');
const sharp = require('sharp');

const User = require('../src/models/User');
const Answer = require('../src/models/Answer');
const Question = require('../src/models/Question');
const Interaction = require('../src/models/Interaction');
const Match = require('../src/models/Match');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const Game = require('../src/models/Game');
const Notification = require('../src/models/Notification');
const ScoreSnapshot = require('../src/models/ScoreSnapshot');
const PersonalityAnalysis = require('../src/models/PersonalityAnalysis');
const UploadService = require('../src/services/upload.service');
const { CONNECTION_STAGES } = require('../src/utils/constants');

const CONFIRM = process.argv.includes('--confirm');
const REVIEWER_PHONE = '+919000000007';

const yearsAgo = (y) => new Date(Date.now() - y * 365.25 * 24 * 60 * 60 * 1000);

// Canned, thoughtful answers reused across profiles (kept generic + warm).
const TEXT_ANSWERS = [
  "I light up and want to share it with the people I love — I'll call someone before I've even finished processing it myself.",
  "It depends on the person, but when I trust someone I'll say what I actually feel rather than keep the peace.",
  "I'd want us to figure it out together — talk it through honestly instead of letting it sit and grow.",
  'A slow morning with good coffee, a long walk, music, and someone I can be completely unguarded with.',
  "By showing up consistently — small, steady things matter more to me than grand gestures.",
  "Curiosity. I want to keep learning and changing, and I want that in the person I'm with too.",
  "I recharge with a mix — quiet time to think, then real conversation with people who get me.",
  "Honesty, warmth, and the ability to laugh at ourselves. Take the connection seriously, not yourself.",
  'Travel that is unplanned — landing somewhere new and letting the day happen.',
  'I notice effort. When someone remembers the small things, that means everything to me.',
  "I'm at my best when I feel safe enough to be silly and serious in the same conversation.",
  "Long term — I'm here for something real, built slowly and honestly.",
];

const FEMALES = [
  {
    firstName: 'Aanya', age: 27, colors: ['#FF6F7D', '#E23A6B'],
    bio: "Architect who sketches on napkins. I love slow mornings, loud laughter, and conversations that lose track of time.",
    voice: 'shimmer',
    voiceScript: "Hi, I'm Aanya. I design spaces for a living, which means I notice the little details — and I think connection is the same. I'd rather know how your mind works than how your weekend looked.",
    stage: CONNECTION_STAGES.REVEALED, score: 88, tier: 'platinum', comfort: 82, revealed: true, daysAgo: 9,
    messages: [
      { from: 'them', text: 'Okay your answer about unplanned travel completely got me 😄', h: 60 },
      { from: 'me', text: "Ha! I stand by it. Best trips are the ones you can't plan.", h: 58 },
      { from: 'them', text: "Agreed. What's the most spontaneous one you've done?", h: 40 },
      { from: 'me', text: 'Booked a bus to Gokarna at 11pm once. No plan, no hotel. Magical.', h: 38 },
      { from: 'them', text: "See, that's the energy I'm looking for ✨", h: 5 },
      { from: 'me', text: 'Then we should plan something unplannable soon 😄', h: 3 },
    ],
  },
  {
    firstName: 'Ishita', age: 26, colors: ['#9DB6FF', '#4E5FC9'],
    bio: 'Reader, runner, occasional poet. I believe the right conversation can change your whole week.',
    voice: 'nova',
    voiceScript: "Hey, I'm Ishita. I read too much and run to think. I'm looking for someone I can be honest with — the easy kind of honest, where silence is comfortable too.",
    stage: CONNECTION_STAGES.CONNECTING, score: 76, tier: 'gold', comfort: 47, revealed: false, daysAgo: 4,
    messages: [
      { from: 'them', text: "Your Sunday answer was basically my dream day too.", h: 30 },
      { from: 'me', text: "Then we'd get along dangerously well on weekends 😄", h: 28 },
      { from: 'them', text: 'What are you reading right now?', h: 6, unread: true },
    ],
  },
  {
    firstName: 'Meher', age: 28, colors: ['#FFC07A', '#FF8A6B'],
    bio: 'Founder by day, dancer by night. High energy, low drama. Make me laugh and you win.',
    voice: 'alloy',
    voiceScript: "Hi! Meher here. I run a small studio and I dance to think straight. Life's a party but I'm looking for my favourite person to leave it with.",
    stage: null, score: 0, tier: 'silver', comfort: 0, revealed: false, daysAgo: 0, messages: [],
  },
];

const REVIEWER = {
  firstName: 'Arjun', age: 29, colors: ['#7E96F0', '#33409E'],
  bio: 'Product designer who cooks to unwind. Curious, calm, a little nerdy. Here for something real.',
  voice: 'onyx',
  voiceScript: "Hey, I'm Arjun. I design products and cook when I need to think. I'm not great at small talk but I love the real kind — tell me what actually matters to you.",
};

async function avatar(firstName, colors, variant = 0) {
  const [c1, c2] = colors;
  const svg =
    `<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${variant ? c2 : c1}"/><stop offset="100%" stop-color="${variant ? c1 : c2}"/>` +
    `</linearGradient></defs><rect width="800" height="800" fill="url(#g)"/>` +
    `<text x="50%" y="56%" font-family="Helvetica,Arial" font-size="320" font-weight="bold" ` +
    `fill="rgba(255,255,255,0.9)" text-anchor="middle">${firstName[0]}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function makeVoiceIntro(userId, persona) {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'tts-1', voice: persona.voice, input: persona.voiceScript, response_format: 'mp3' }),
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const { url, s3Key } = await UploadService.uploadVoiceIntro(buffer, userId, 'intro.mp3');
    const duration = Math.min(60, Math.max(8, Math.round(persona.voiceScript.split(/\s+/).length / 2.5)));
    return { audioUrl: url, s3Key, duration, transcription: persona.voiceScript, createdAt: new Date() };
  } catch (e) {
    console.log(`    voice intro skipped (${e.message})`);
    return null;
  }
}

async function wipe(phone) {
  const u = await User.findOne({ phone }).lean();
  if (!u) return;
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
}

async function seedAnswers(user, questions) {
  let n = 0;
  for (const q of questions) {
    const base = { userId: user._id, questionId: q._id, questionNumber: q.questionNumber,
      questionTextSnapshot: q.questionText, dimensionSnapshot: q.dimension, questionTypeSnapshot: q.questionType };
    if (q.questionType === 'text') {
      base.textAnswer = TEXT_ANSWERS[n % TEXT_ANSWERS.length];
    } else if (q.questionType === 'single_choice') {
      base.selectedOption = (q.options || [])[0] || 'Yes';
    } else {
      base.selectedOptions = [(q.options || [])[0] || 'Yes'];
    }
    await Answer.create(base);
    n++;
  }
  return n;
}

async function buildUser(phone, persona, gender, interestedIn, questions) {
  await wipe(phone);
  const user = await User.create({
    phone, phoneVerified: true, firstName: persona.firstName,
    dateOfBirth: yearsAgo(persona.age), gender, interestedIn,
    location: { city: 'Bengaluru', coordinates: [77.5946, 12.9716] },
    bio: { text: persona.bio },
    profileStage: 'ready', isActive: true, isBanned: false,
  });
  // photos
  const main = await avatar(persona.firstName, persona.colors, 0);
  const profilePhoto = await UploadService.processProfilePhoto(main, user._id.toString());
  const g0 = await UploadService.processGalleryPhoto(main, user._id.toString(), 0);
  const second = await avatar(persona.firstName, persona.colors, 1);
  const g1 = await UploadService.processGalleryPhoto(second, user._id.toString(), 1);
  user.photos = {
    items: [
      { url: g0.url, s3Key: g0.s3Key, order: 0, uploadedAt: new Date() },
      { url: g1.url, s3Key: g1.s3Key, order: 1, uploadedAt: new Date() },
    ],
    profilePhoto, totalPhotos: 2,
  };
  // voice intro
  const vi = await makeVoiceIntro(user._id.toString(), persona);
  if (vi) user.voiceIntro = vi;
  // answers
  const answered = await seedAnswers(user, questions);
  user.questionsAnswered = answered;
  await user.save();
  console.log(`  ✓ ${persona.firstName} (${phone}) ready — ${answered} answers, photos${vi ? ' + voice' : ''}`);
  return user;
}

async function makeMatch(reviewer, woman, f) {
  const users = [reviewer._id.toString(), woman._id.toString()].sort();
  const data = {
    users, stage: f.stage, compatibilityScore: f.score, matchTier: f.tier,
    matchedAt: new Date(Date.now() - f.daysAgo * 86400000),
    comfortScore: f.comfort, comfortScoreUpdatedAt: new Date(),
    comfortStats: { activeDays: f.revealed ? 5 : 2, qualityMessages: f.messages.length },
    isActive: true,
  };
  if (f.revealed) {
    data.revealStatus = {
      user1: { userId: users[0], requested: true },
      user2: { userId: users[1], requested: true },
      revealedAt: new Date(Date.now() - 26 * 3600000),
    };
  }
  const match = await Match.create(data);
  const convo = new Conversation({ participants: [reviewer._id, woman._id], matchId: match._id, isActive: true });
  let reviewerUnread = 0;
  const msgs = f.messages.map((m) => {
    const createdAt = new Date(Date.now() - m.h * 3600000);
    if (m.unread) reviewerUnread++;
    return {
      conversationId: convo._id,
      senderId: m.from === 'me' ? reviewer._id : woman._id,
      type: 'text', content: { text: m.text },
      readAt: m.unread ? null : createdAt, createdAt, updatedAt: createdAt,
    };
  });
  if (msgs.length) {
    await Message.insertMany(msgs, { timestamps: false });
    const last = msgs[msgs.length - 1];
    convo.lastMessage = { text: last.content.text, senderId: last.senderId, sentAt: last.createdAt, type: 'text' };
  }
  convo.messageCount = msgs.length;
  convo.unreadCount.set(reviewer._id.toString(), reviewerUnread);
  convo.unreadCount.set(woman._id.toString(), 0);
  await convo.save();
  console.log(`  ✓ match ${woman.firstName} — ${f.stage}, comfort ${f.comfort}, ${msgs.length} msgs`);
}

async function main() {
  if (!CONFIRM) { console.error('ABORT: pass --confirm'); process.exit(1); }
  if (!process.env.MONGODB_URI) { console.error('ABORT: MONGODB_URI not set'); process.exit(1); }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  const questions = await Question.find().sort({ questionNumber: 1 }).limit(12).lean();
  console.log(`Using ${questions.length} questions for answers`);

  console.log('\nReviewer:');
  const reviewer = await buildUser(REVIEWER_PHONE, REVIEWER, 'male', 'women', questions);

  console.log('\nDemo women:');
  const women = [];
  for (let i = 0; i < FEMALES.length; i++) {
    women.push(await buildUser(`+91900000010${i + 1}`, FEMALES[i], 'female', 'men', questions));
  }

  console.log('\nMatches:');
  for (let i = 0; i < FEMALES.length; i++) {
    if (FEMALES[i].stage) await makeMatch(reviewer, women[i], FEMALES[i]);
  }

  console.log('\n✅ Reviewer demo seeded.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => { console.error('SEED FAILED:', e); process.exit(1); });
