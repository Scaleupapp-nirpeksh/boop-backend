#!/usr/bin/env node

/**
 * Seed 3 female test users engineered against the REAL compatibility engine,
 * plus the founder demo state (matches at three pipeline stages).
 *
 * Engineered tiers (verified by recomputing with CompatibilityService):
 *   - Aanya  → PLATINUM (≥85): answers Q1–25 mirroring the keeper — identical
 *     single-choice picks, text answers AI-paraphrased from the keeper's own
 *     answers (high embedding cosine similarity, no verbatim copies).
 *   - Ishita → GOLD (75–84): answers Q1–20 mostly aligned — 3 single choices
 *     diverge, 3 text answers swapped for divergent canned content.
 *   - Meher  → SILVER (65–74): answers Q1–15 partly aligned — 3 of 8 single
 *     choices diverge, 5 of 7 texts are contrasting canned content.
 *
 * Demo state per user (mirrors the live match pipeline):
 *   - Aanya:  match stage 'revealed'   (comfort 84, photos revealed, 6 messages)
 *   - Ishita: match stage 'connecting' (comfort 46, 3 messages)
 *   - Meher:  match stage 'mutual'     (comfort 12, fresh match, 1 message)
 *   NO Interaction docs are created (either direction): matched users still
 *   SURFACE IN DISCOVER for the keeper (getCandidates only excludes users the
 *   keeper has interacted with), and a like-back can never collide with the
 *   pre-made match's unique pairKey.
 *
 * Each test user also gets:
 *   - Answers with OpenAI text-embedding-3-small embeddings (real engine path)
 *   - A gpt-4o personality analysis (archetype + facets) via PersonalityService
 *   - A TTS voice intro (OpenAI tts-1) uploaded to S3
 *   - Profile photo (original/blurred/silhouette via sharp) + 2 gallery photos
 *
 * Idempotent-ish: if a test user already exists (matched by phone — including
 * the legacy +91999000000x batch), that user and ALL their traces (answers,
 * analyses, interactions, matches + conversations + messages + games +
 * snapshots, notifications, S3 media) are wiped and re-created fresh.
 *
 * Hard guards: requires --confirm; aborts unless the keeper (phone
 * *8800237144) resolves to the expected _id.
 *
 * Usage: node scripts/seedTestMatches.js --confirm
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

const CompatibilityService = require('../src/services/compatibility.service');
const EmbeddingService = require('../src/services/embedding.service');
const UploadService = require('../src/services/upload.service');
const PersonalityService = require('../src/services/personality.service');

const KEEPER_PHONE_SUFFIX = /8800237144$/;
const EXPECTED_KEEPER_ID = '69b1523c1a63014358e3d9ee';
const CONFIRM = process.argv.includes('--confirm');

// Earlier ad-hoc seed batches that should be superseded by this script.
const LEGACY_TEST_PHONES = ['+919990000001', '+919990000002', '+919990000003'];

// ─── Personas ──────────────────────────────────────────────────────
// ageDelta: years younger than the keeper (keeps everyone inside the ±5y
// discover age filter regardless of when this runs).

const PERSONAS = [
  {
    firstName: 'Aanya',
    phone: '+919900011101',
    ageDelta: 1,
    answerCount: 25,
    divergeSingles: new Set(),
    cannedTexts: {}, // every text answer is a close paraphrase of the keeper's
    targetBand: [85, 100],
    targetLabel: 'platinum',
    bio: 'Book-hoarder, chai loyalist, sunset-walk enthusiast. I ask real questions and remember your answers.',
    coords: [77.6408, 12.9279], // Koramangala
    voice: 'nova',
    voiceScript:
      "Hi, I'm Aanya. I think the best connections start slow — a real conversation, a long walk, food we both love. I'm a reader, a chai person, and someone who remembers the small details. If you can talk about the big stuff and laugh about the small stuff, we'll get along.",
    portraitUrls: ['https://i.pravatar.cc/800?img=47', 'https://i.pravatar.cc/800?img=45'],
    fallbackColors: ['#7c5cff', '#ff7ab6'],
    demo: {
      stage: 'revealed',
      comfortScore: 84,
      comfortStats: { activeDays: 4, qualityMessages: 9 },
      matchedDaysAgo: 4,
      revealed: true,
      messages: [
        { from: 'her', hoursAgo: 78, text: 'Okay I have to say it — your answer about calling your mom first? Same. She still hears everything before anyone else.' },
        { from: 'keeper', hoursAgo: 75, text: 'Ha, finally someone who gets it. What does your perfect Sunday actually look like?' },
        { from: 'her', hoursAgo: 50, text: "Slow morning, a long walk, then cooking something elaborate while old songs play. Bonus points if there's good chai involved." },
        { from: 'keeper', hoursAgo: 48, text: "That's dangerously close to my exact Sunday." },
        { from: 'her', hoursAgo: 26, text: 'I had a feeling. Okay, photos revealed — you have a kind face. That tracks.' },
        { from: 'her', hoursAgo: 3, text: 'Book recommendation for the week: anything by Ruskin Bond. Your turn.', unread: true },
      ],
    },
  },
  {
    firstName: 'Ishita',
    phone: '+919900011102',
    ageDelta: 3,
    answerCount: 20,
    // 3 of 11 single-choice answers diverge (life_vision, lifestyle, conflict)
    divergeSingles: new Set([5, 13, 19]),
    // preferred divergent option index per question (falls back to any different)
    divergePrefs: { 5: 3, 13: 0, 19: 1 },
    cannedTexts: {
      6: "Honestly, Sundays are my catch-up day — gym first thing, then I go through my week's plan, prep meals, and squeeze in a networking brunch if I can. Rest is earned.",
      14: 'I got my open-water scuba certification last month at Netrani! Next up is learning to ride an Enfield properly for a Ladakh trip I am planning with my college gang.',
      20: 'My team once threw me a surprise party at the office when I closed a huge deal. Balloons, cake, the works. I was so touched that they noticed how hard I had worked for it.',
    },
    targetBand: [72, 86],
    targetLabel: 'gold',
    bio: 'Product manager who treks on weekends. Planner by nature, spontaneous by exception. Filter coffee over everything.',
    coords: [77.7011, 12.9569], // Marathahalli
    voice: 'shimmer',
    voiceScript:
      "Hey, Ishita here. I run on filter coffee, ambitious plans, and weekend treks. I'll plan the itinerary, you bring the playlist. Looking for someone who has their own thing going on, but always makes time for the people who matter.",
    portraitUrls: ['https://i.pravatar.cc/800?img=49', 'https://i.pravatar.cc/800?img=26'],
    fallbackColors: ['#0ea5e9', '#22d3ee'],
    demo: {
      stage: 'connecting',
      comfortScore: 46,
      comfortStats: { activeDays: 2, qualityMessages: 5 },
      matchedDaysAgo: 2,
      revealed: false,
      messages: [
        { from: 'her', hoursAgo: 40, text: 'Your take on giving things time before bringing them up — I had to learn that one the hard way. Respect.' },
        { from: 'keeper', hoursAgo: 30, text: 'Took me a few years too. Any trek plans this weekend?' },
        { from: 'her', hoursAgo: 5, text: 'Skandagiri sunrise trek if the weather behaves. You should come for the next one.', unread: true },
      ],
    },
  },
  {
    firstName: 'Meher',
    phone: '+919900011103',
    ageDelta: 4,
    answerCount: 15,
    // 3 of 8 single choices diverge; q10/q12 texts paraphrased, rest canned
    divergeSingles: new Set([5, 11, 13]),
    divergePrefs: { 5: 1, 11: 0, 13: 2 },
    cannedTexts: {
      1: 'Nobody — I just post it on my story and let everyone find out at once! Watching the reactions roll in is half the fun honestly.',
      4: "I barely notice, my phone is always blowing up anyway. If it's important they'll call. I'm not the type to sit around watching the chat.",
      6: 'Brunch with the squad, day party by the pool, shopping in Indiranagar, then a house party till late. Sundays are for being OUT — sleep is for Mondays.',
      8: "People say I laugh things off too quickly. Heavy serious talks drain me, so I crack a joke and move on. Life's too short for long fights.",
      14: "I learned a viral dance routine for a friend's sangeet and now I'm lowkey the group's choreographer. Thirty reels later I am still not bored of it.",
    },
    targetBand: [58, 74],
    targetLabel: 'silver',
    bio: 'Professional brunch attendee, amateur salsa dancer. I bring the energy, you bring the playlist.',
    coords: [77.5946, 12.9716], // city centre
    voice: 'alloy',
    voiceScript:
      "Hi hi, I'm Meher! Life's a party and I'm usually the one starting it. Brunches, dancing, last-minute road trips — I'm in. If you can keep up with my energy and make me laugh, we're already halfway there.",
    portraitUrls: ['https://i.pravatar.cc/800?img=25', 'https://i.pravatar.cc/800?img=31'],
    fallbackColors: ['#f59e0b', '#ef4444'],
    demo: {
      stage: 'mutual',
      comfortScore: 12,
      comfortStats: { activeDays: 1, qualityMessages: 1 },
      matchedDaysAgo: 0.15,
      revealed: false,
      messages: [
        { from: 'her', hoursAgo: 2, text: "Hii! Okay so we matched — tell me something about you that's NOT in your profile.", unread: true },
      ],
    },
  },
];

// ─── OpenAI helpers ────────────────────────────────────────────────

/**
 * Paraphrase the keeper's text answer in the persona's voice while keeping the
 * semantics close (high embedding similarity). Falls back to the original
 * text on any failure so the engineered score still holds.
 */
async function paraphrase(persona, age, question, keeperText) {
  if (!process.env.OPENAI_API_KEY) return keeperText;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 160,
        messages: [
          {
            role: 'system',
            content: 'You rewrite dating-app answers. Reply with ONLY the rewritten answer text — no quotes, no preamble.',
          },
          {
            role: 'user',
            content:
              `Question: "${question.questionText}"\n` +
              `Original answer: "${keeperText}"\n\n` +
              `Rewrite this answer as ${persona.firstName}, a ${age}-year-old woman living in Bengaluru. ` +
              'Keep the same core personality, values, preferences and specific substance so the rewritten answer stays semantically very close to the original, ' +
              'but phrase it freshly in her own natural first-person voice. Similar length, under 60 words. No emojis.',
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`chat ${res.status}`);
    const data = await res.json();
    let out = (data.choices?.[0]?.message?.content || '').trim().replace(/^["']+|["']+$/g, '');
    if (!out) return keeperText;
    if (out.length > 480) out = out.slice(0, 480);
    return out;
  } catch (err) {
    console.log(`    paraphrase fallback for q${question.questionNumber} (${err.message})`);
    return keeperText;
  }
}

/** Generate an mp3 voice intro via OpenAI TTS and upload it to S3. */
async function generateVoiceIntro(userId, persona) {
  if (!process.env.OPENAI_API_KEY) return null;
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: persona.voice,
      input: persona.voiceScript,
      response_format: 'mp3',
    }),
  });
  if (!res.ok) throw new Error(`tts ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const { url, s3Key } = await UploadService.uploadVoiceIntro(buffer, userId, 'intro.mp3');
  const words = persona.voiceScript.split(/\s+/).length;
  const duration = Math.min(60, Math.max(6, Math.round(words / 2.5)));
  return { audioUrl: url, s3Key, duration, transcription: persona.voiceScript, createdAt: new Date() };
}

// ─── Photo helpers ─────────────────────────────────────────────────

async function fetchPortrait(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`portrait fetch ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function fallbackAvatar(persona, variant = 0) {
  const [c1, c2] = persona.fallbackColors;
  const svg =
    `<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${variant ? c2 : c1}"/><stop offset="100%" stop-color="${variant ? c1 : c2}"/>` +
    `</linearGradient></defs><rect width="800" height="800" fill="url(#g)"/>` +
    `<text x="50%" y="55%" font-family="Helvetica, Arial" font-size="320" font-weight="bold" ` +
    `fill="rgba(255,255,255,0.85)" text-anchor="middle">${persona.firstName[0]}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function seedPhotos(userId, persona) {
  let main;
  try {
    main = await fetchPortrait(persona.portraitUrls[0]);
  } catch (err) {
    console.log(`    portrait #0 fallback (${err.message})`);
    main = await fallbackAvatar(persona, 0);
  }
  const profilePhoto = await UploadService.processProfilePhoto(main, userId);

  const items = [];
  const g0 = await UploadService.processGalleryPhoto(main, userId, 0);
  items.push({ url: g0.url, s3Key: g0.s3Key, order: 0, uploadedAt: new Date() });

  let second;
  try {
    second = await fetchPortrait(persona.portraitUrls[1]);
  } catch (err) {
    console.log(`    portrait #1 fallback (${err.message})`);
    second = await fallbackAvatar(persona, 1);
  }
  const g1 = await UploadService.processGalleryPhoto(second, userId, 1);
  items.push({ url: g1.url, s3Key: g1.s3Key, order: 1, uploadedAt: new Date() });

  return { items, profilePhoto, totalPhotos: items.length };
}

// ─── Answer engineering ────────────────────────────────────────────

/** Pick a single-choice option guaranteed different from the keeper's. */
function pickDifferentOption(question, keeperOption, preferredIndex) {
  const options = question.options || [];
  if (options.length === 0) return keeperOption || null;
  if (
    preferredIndex !== undefined &&
    options[preferredIndex] !== undefined &&
    options[preferredIndex] !== keeperOption
  ) {
    return options[preferredIndex];
  }
  return options.find((o) => o !== keeperOption) || options[0];
}

/** Pick a multiple-choice set as disjoint from the keeper's as possible. */
function pickDivergentOptions(question, keeperOptions) {
  const options = question.options || [];
  const keeperSet = new Set(keeperOptions || []);
  const others = options.filter((o) => !keeperSet.has(o));
  if (others.length > 0) return others.slice(0, 2);
  return options.slice(0, 1);
}

// ─── Idempotency: wipe an existing test user and all traces ────────

async function wipeTestUser(phone) {
  const existing = await User.findOne({ phone }).lean();
  if (!existing) return false;
  const uid = existing._id;

  const matches = await Match.find({ users: uid }).select('_id').lean();
  const matchIds = matches.map((m) => m._id);
  const convos = await Conversation.find({
    $or: [{ matchId: { $in: matchIds } }, { participants: uid }],
  })
    .select('_id')
    .lean();
  const convoIds = convos.map((c) => c._id);

  await Message.deleteMany({ $or: [{ conversationId: { $in: convoIds } }, { senderId: uid }] });
  await Game.deleteMany({ $or: [{ matchId: { $in: matchIds } }, { conversationId: { $in: convoIds } }] });
  await ScoreSnapshot.deleteMany({ matchId: { $in: matchIds } });
  await Conversation.deleteMany({ _id: { $in: convoIds } });
  await Match.deleteMany({ _id: { $in: matchIds } });
  await Interaction.deleteMany({ $or: [{ fromUser: uid }, { toUser: uid }] });
  await Notification.deleteMany({ userId: uid });
  await PersonalityAnalysis.deleteMany({ userId: uid });
  await Answer.deleteMany({ userId: uid });
  try {
    await UploadService.deleteAllUserMedia(uid.toString());
  } catch (_) {
    /* best effort */
  }
  await User.deleteOne({ _id: uid });
  return true;
}

// ─── Demo state: match + conversation + messages ───────────────────

async function seedDemoState(keeper, user, persona, compat) {
  const demo = persona.demo;
  const sortedUsers = [keeper._id.toString(), user._id.toString()].sort();

  const matchData = {
    users: sortedUsers,
    stage: demo.stage,
    compatibilityScore: compat.score,
    matchTier: compat.tier,
    dimensionScores: compat.dimensions || {},
    matchedAt: new Date(Date.now() - demo.matchedDaysAgo * 24 * 60 * 60 * 1000),
    comfortScore: demo.comfortScore,
    comfortScoreUpdatedAt: new Date(),
    comfortStats: demo.comfortStats,
    isActive: true,
  };
  if (demo.revealed) {
    matchData.revealStatus = {
      user1: { userId: sortedUsers[0], requested: true },
      user2: { userId: sortedUsers[1], requested: true },
      revealedAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
    };
  }
  const match = await Match.create(matchData);

  const convo = new Conversation({
    participants: [keeper._id, user._id],
    matchId: match._id,
    isActive: true,
  });

  let keeperUnread = 0;
  const msgDocs = (demo.messages || []).map((m) => {
    const createdAt = new Date(Date.now() - m.hoursAgo * 60 * 60 * 1000);
    if (m.unread) keeperUnread++;
    return {
      conversationId: convo._id,
      senderId: m.from === 'keeper' ? keeper._id : user._id,
      type: 'text',
      content: { text: m.text },
      readAt: m.unread ? null : createdAt,
      createdAt,
      updatedAt: createdAt,
    };
  });

  if (msgDocs.length > 0) {
    await Message.insertMany(msgDocs, { timestamps: false });
    const last = msgDocs[msgDocs.length - 1];
    convo.lastMessage = { text: last.content.text, senderId: last.senderId, sentAt: last.createdAt, type: 'text' };
  }
  convo.messageCount = msgDocs.length;
  convo.unreadCount.set(keeper._id.toString(), keeperUnread);
  convo.unreadCount.set(user._id.toString(), 0);
  await convo.save();

  return { match, convo, messageCount: msgDocs.length, keeperUnread };
}

// ─── Discover simulation (mirrors DiscoverService.getCandidates) ───

function buildAgeFilter(currentUserDob, range = 5) {
  if (!currentUserDob) return {};
  const now = new Date();
  const currentAge = Math.floor((now - new Date(currentUserDob)) / (365.25 * 24 * 60 * 60 * 1000));
  const minAge = Math.max(18, currentAge - range);
  const maxAge = currentAge + range;
  const earliestDob = new Date(now.getFullYear() - maxAge - 1, now.getMonth(), now.getDate());
  const latestDob = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
  return { dateOfBirth: { $gte: earliestDob, $lte: latestDob } };
}

function buildGenderFilter(currentUser) {
  const filter = {};
  if (currentUser.interestedIn === 'men') filter.gender = 'male';
  else if (currentUser.interestedIn === 'women') filter.gender = 'female';
  if (currentUser.gender === 'male') filter.interestedIn = { $in: ['men', 'everyone'] };
  else if (currentUser.gender === 'female') filter.interestedIn = { $in: ['women', 'everyone'] };
  else filter.interestedIn = 'everyone';
  return filter;
}

async function simulateDiscover(keeper) {
  const interacted = await Interaction.find({ fromUser: keeper._id }, { toUser: 1 }).lean();
  const excludeIds = interacted.map((d) => d.toUser);
  excludeIds.push(keeper._id);

  const query = {
    _id: { $nin: excludeIds },
    profileStage: 'ready',
    isActive: true,
    isBanned: false,
    ...buildGenderFilter(keeper),
    ...buildAgeFilter(keeper.dateOfBirth, 5),
  };

  const candidates = await User.find(query).select('firstName phone dateOfBirth').limit(10).lean();
  const rows = [];
  for (const c of candidates) {
    const compat = await CompatibilityService.calculateCompatibility(
      keeper._id.toString(),
      c._id.toString()
    );
    rows.push({ name: c.firstName, phone: c.phone, score: compat.score, tier: compat.tier });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  if (!CONFIRM) {
    console.error('ABORT: refusing to run without --confirm.');
    console.error('Usage: node scripts/seedTestMatches.js --confirm');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('ABORT: MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Redis (optional) — lets the compatibility cache warm with correct values.
  let redisConnected = false;
  try {
    const { connectRedis } = require('../src/config/redis');
    redisConnected = !!(await connectRedis());
  } catch (_) {
    /* non-fatal */
  }

  // ─── Hard guards ─────────────────────────────────────────────────
  const keeper = await User.findOne({ phone: KEEPER_PHONE_SUFFIX }).lean();
  if (!keeper) {
    console.error('ABORT: keeper user (phone *8800237144) not found.');
    process.exit(1);
  }
  if (keeper._id.toString() !== EXPECTED_KEEPER_ID) {
    console.error(`ABORT: keeper id mismatch. Found ${keeper._id}, expected ${EXPECTED_KEEPER_ID}.`);
    process.exit(1);
  }
  const keeperAge = Math.floor(
    (Date.now() - new Date(keeper.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
  console.log(`Keeper verified: ${keeper.firstName} (${keeper._id}), age ${keeperAge}, ${keeper.location?.city}`);

  // ─── Build the seed pool: keeper-answered questions in the catalog ─
  const keeperAnswers = await Answer.find({ userId: keeper._id }).lean();
  const questions = await Question.find({}).lean();
  const questionMap = new Map(questions.map((q) => [q.questionNumber, q]));

  const pool = keeperAnswers
    .filter((a) => questionMap.has(a.questionNumber))
    .sort((a, b) => a.questionNumber - b.questionNumber)
    .map((a) => ({ question: questionMap.get(a.questionNumber), keeperAnswer: a }));

  console.log(`Seed pool: ${pool.length} keeper-answered catalog questions`);
  if (pool.length < 15) {
    console.error('ABORT: keeper has fewer than 15 catalog answers — cannot engineer scores.');
    process.exit(1);
  }

  // Supersede earlier ad-hoc test batches
  for (const oldPhone of LEGACY_TEST_PHONES) {
    if (await wipeTestUser(oldPhone)) console.log(`Legacy test user ${oldPhone} wiped`);
  }

  const summary = [];

  for (const persona of PERSONAS) {
    console.log(`\n━━━ ${persona.firstName} (${persona.phone}) → target ${persona.targetLabel}, stage ${persona.demo.stage} ━━━`);

    // Idempotency: wipe any previous incarnation
    const wiped = await wipeTestUser(persona.phone);
    if (wiped) console.log('  existing test user wiped (answers, analyses, matches, media)');

    const age = keeperAge - persona.ageDelta;
    const dob = new Date(Date.now() - (age * 365.25 + 40) * 24 * 60 * 60 * 1000);
    const answerCount = Math.min(persona.answerCount, pool.length);

    // 1. Create the user
    const user = await User.create({
      phone: persona.phone,
      phoneVerified: true,
      firstName: persona.firstName,
      dateOfBirth: dob,
      gender: 'female',
      interestedIn: 'men',
      location: { city: keeper.location?.city || 'Bengaluru', coordinates: persona.coords },
      bio: { text: persona.bio },
      questionsAnswered: answerCount,
      profileStage: 'ready',
      isActive: true,
      isBanned: false,
      lastActive: new Date(),
    });
    console.log(`  user created: ${user._id} (age ${age})`);

    // 2. Engineer answers against the real scoring rules
    const docs = [];
    const textIdx = [];
    for (let i = 0; i < answerCount; i++) {
      const { question: q, keeperAnswer: ka } = pool[i];
      const doc = {
        userId: user._id,
        questionId: q._id,
        questionNumber: q.questionNumber,
        questionTextSnapshot: q.questionText,
        dimensionSnapshot: q.dimension,
        questionTypeSnapshot: q.questionType,
        selectedOptions: [],
        timeSpent: 15 + Math.floor(Math.random() * 60),
        submittedAt: new Date(Date.now() - (answerCount - i) * 47 * 60 * 1000), // staggered over ~1 day
      };

      if (q.questionType === 'text') {
        const canned = persona.cannedTexts[q.questionNumber];
        if (canned) {
          doc.textAnswer = canned;
        } else {
          doc.textAnswer = await paraphrase(persona, age, q, ka.textAnswer || '');
        }
        textIdx.push(docs.length);
      } else if (q.questionType === 'single_choice') {
        doc.selectedOption = persona.divergeSingles.has(q.questionNumber)
          ? pickDifferentOption(q, ka.selectedOption, (persona.divergePrefs || {})[q.questionNumber])
          : ka.selectedOption;
      } else if (q.questionType === 'multiple_choice') {
        doc.selectedOptions = persona.divergeSingles.has(q.questionNumber)
          ? pickDivergentOptions(q, ka.selectedOptions)
          : [...(ka.selectedOptions || [])];
      }
      docs.push(doc);
    }

    // 3. Embeddings for text answers (same model the engine compares with)
    const texts = textIdx.map((i) => docs[i].textAnswer);
    const embeddings = await EmbeddingService.batchGenerateEmbeddings(texts);
    let embedded = 0;
    textIdx.forEach((docI, k) => {
      if (embeddings[k]) {
        docs[docI].embedding = embeddings[k];
        embedded++;
      }
    });
    await Answer.insertMany(docs);
    console.log(`  answers: ${docs.length} (${texts.length} text, ${embedded} embedded)`);

    // 4. Media — photos (profile + blur + silhouette + gallery) and voice intro
    try {
      const photos = await seedPhotos(user._id.toString(), persona);
      await User.updateOne({ _id: user._id }, { $set: { photos } });
      console.log('  photos: profile (original/blurred/silhouette) + 2 gallery');
    } catch (err) {
      console.log(`  photos SKIPPED: ${err.message}`);
    }
    try {
      const voiceIntro = await generateVoiceIntro(user._id.toString(), persona);
      if (voiceIntro) {
        await User.updateOne({ _id: user._id }, { $set: { voiceIntro } });
        console.log(`  voice intro: ${voiceIntro.duration}s (${persona.voice})`);
      }
    } catch (err) {
      console.log(`  voice intro SKIPPED: ${err.message}`);
    }

    // 5. Real engine verification — compatibility vs the keeper
    const compat = await CompatibilityService.calculateCompatibility(
      keeper._id.toString(),
      user._id.toString()
    );
    const [lo, hi] = persona.targetBand;
    const inBand = compat.score >= lo && compat.score <= hi;
    console.log(
      `  compatibility: ${compat.score} (${compat.tier}) ${inBand ? '— in target band' : `— OUTSIDE target band [${lo},${hi}]`}`
    );
    console.log(`  dimensions: ${JSON.stringify(compat.dimensions)}`);

    // 6. Demo state — match at stage + conversation + messages
    const demoState = await seedDemoState(keeper, user, persona, compat);
    console.log(
      `  match: ${demoState.match._id} stage=${persona.demo.stage} comfort=${persona.demo.comfortScore} | conversation: ${demoState.messageCount} messages (${demoState.keeperUnread} unread for keeper)`
    );

    // 7. Personality analysis (gpt-4o) — archetype, facets, numerology
    let archetype = 'FAILED';
    try {
      const analysis = await PersonalityService.generateAnalysis(user._id.toString(), answerCount);
      archetype = `${analysis.archetypeCode} "${analysis.personalityType}"`;
      console.log(`  personality: ${archetype}`);
    } catch (err) {
      console.log(`  personality analysis FAILED (non-fatal): ${err.message}`);
    }

    summary.push({
      name: persona.firstName,
      phone: persona.phone,
      userId: user._id.toString(),
      score: compat.score,
      tier: compat.tier,
      target: persona.targetLabel,
      stage: persona.demo.stage,
      answers: docs.length,
      archetype,
    });
  }

  // ─── Verify: do the seeded users surface in the keeper's Discover? ─
  console.log('\n━━━ Discover simulation for keeper (same filters as getCandidates) ━━━');
  const rows = await simulateDiscover(keeper);
  rows.forEach((r) => console.log(`  ${r.score} (${r.tier})  ${r.name}  ${r.phone}`));

  const seedPhones = new Set(PERSONAS.map((p) => p.phone));
  const surfaced = rows.filter((r) => seedPhones.has(r.phone));
  const allSurfaced = surfaced.length === PERSONAS.length;

  // ─── Flush volatile caches so the live app picks everything up ────
  if (redisConnected) {
    try {
      const cache = require('../src/utils/cache');
      await cache.invalidatePattern('showcase:*');
      await cache.invalidatePattern('discover:stats:*');
      await cache.invalidatePattern('questions:available:*');
      await cache.invalidate('archetype:distribution');
      console.log('\nCaches flushed (showcase, discover:stats, questions:available, archetype:distribution)');
    } catch (_) {
      /* non-fatal */
    }
    try {
      const { closeRedis } = require('../src/config/redis');
      await closeRedis();
    } catch (_) {
      /* non-fatal */
    }
  }

  console.log('\n━━━ Summary ━━━');
  summary.forEach((s) =>
    console.log(
      `  ${s.name} (${s.phone}, ${s.userId}): score ${s.score} ${s.tier} (target ${s.target}), match stage ${s.stage}, ${s.answers} answers, ${s.archetype}`
    )
  );
  console.log(
    allSurfaced
      ? `\nOK: all ${PERSONAS.length} test users surface in the keeper's Discover feed.`
      : `\nERROR: only ${surfaced.length}/${PERSONAS.length} test users surface in Discover!`
  );

  await mongoose.disconnect();
  process.exit(allSurfaced ? 0 : 1);
}

main().catch(async (err) => {
  console.error('SEED FAILED:', err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
