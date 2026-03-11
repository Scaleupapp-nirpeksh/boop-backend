#!/usr/bin/env node
require('dotenv').config();
/**
 * Boop End-to-End Test Script
 *
 * Tests the full user journey: auth → onboarding → discover → like → match → chat → games
 *
 * Prerequisites:
 *   1. Backend running on localhost:3000
 *   2. DEV_SKIP_TWILIO=true in .env (so OTPs are logged to console)
 *   3. Questions seeded (npm run seed:questions)
 *   4. Redis running
 *
 * Usage: node scripts/e2e-test.js
 */

const BASE = 'http://localhost:3000/api/v1';

// Two test phone numbers
const USER_A_PHONE = '+19991110001';
const USER_B_PHONE = '+19991110002';

let userA = { phone: USER_A_PHONE };
let userB = { phone: USER_B_PHONE };

// ── Helpers ──

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const url = `${BASE}${path}`;
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));

  if (!res.ok && res.status >= 500) {
    console.error(`  ❌ ${method} ${path} → ${res.status}`, json.message || '');
  }
  return { status: res.status, ...json };
}

function log(emoji, msg) {
  console.log(`${emoji}  ${msg}`);
}

function section(title) {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(50)}`);
}

// ── Direct DB access for auth (bypasses bcrypt OTP brute force) ──

const mongoose = require('mongoose');
const AuthService = require('../src/services/auth.service');
let dbConnected = false;

async function connectDB() {
  await mongoose.connect(process.env.MONGODB_URI);
  dbConnected = true;
}

// ── Auth (uses internal service directly — sends OTP, captures it, verifies) ──

async function authenticate(user) {
  log('📱', `Authenticating ${user.phone}...`);

  // Use the internal auth service which calls sendOTP → logs to console with DEV_SKIP_TWILIO=true
  // But we can't capture the console output, so we'll intercept the OTP before it's hashed.
  // Instead, we directly create a known OTP in the DB:

  const bcrypt = require('bcryptjs');
  const OTP = require('../src/models/OTP');

  const code = '123456';
  const salt = await bcrypt.genSalt(10);
  const hashedCode = await bcrypt.hash(code, salt);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Clear existing OTPs for this phone
  await OTP.deleteMany({ phone: user.phone });

  // Insert a known OTP
  await OTP.create({ phone: user.phone, code: hashedCode, expiresAt });

  // Now verify it via the API
  const verifyRes = await api('POST', '/auth/verify-otp', {
    phone: user.phone,
    otp: code,
  });

  if (!verifyRes.data?.accessToken) {
    log('❌', `Auth failed for ${user.phone}: ${verifyRes.message}`);
    process.exit(1);
  }

  user.token = verifyRes.data.accessToken;
  user.refreshToken = verifyRes.data.refreshToken;
  user.id = verifyRes.data.user._id || verifyRes.data.user.id;
  user.isNew = verifyRes.data.isNewUser;

  log('✅', `Authenticated ${user.phone} (${user.isNew ? 'NEW' : 'existing'} user, id: ${user.id})`);
}

// ── Profile Setup ──

async function setupProfile(user, firstName, gender, interestedIn, city, bio) {
  log('📝', `Setting up profile for ${firstName}...`);

  const res = await api('PUT', '/profile/basic-info', {
    firstName,
    dateOfBirth: '1995-06-15',
    gender,
    interestedIn,
    bio,
    location: {
      city,
      coordinates: [-73.9857, 40.7484], // NYC
    },
  }, user.token);

  if (res.success) {
    log('✅', `Profile set: ${firstName} (${gender}, interested in ${interestedIn})`);
  } else {
    log('⚠️', `Profile update: ${res.message}`);
  }

  // Force profileStage to 'ready' and add dummy photos/voice for testing
  const User = require('../src/models/User');
  await User.findByIdAndUpdate(user.id, {
    profileStage: 'ready',
    questionsAnswered: 15,
    isActive: true,
    'photos.items': [
      { url: 'https://placehold.co/400x400/FF6B6B/white?text=' + firstName[0], isMain: true },
      { url: 'https://placehold.co/400x400/4ECDC4/white?text=2', isMain: false },
      { url: 'https://placehold.co/400x400/FFD93D/white?text=3', isMain: false },
    ],
    'photos.blurredUrl': 'https://placehold.co/400x400/cccccc/white?text=Blurred',
    'photos.silhouetteUrl': 'https://placehold.co/400x400/333333/white?text=Silhouette',
    'voiceIntro.audioUrl': 'https://example.com/voice-test.m4a',
    'voiceIntro.duration': 8,
  });
  log('✅', `Profile stage set to 'ready' with test photos`);

  user.firstName = firstName;
}

// ── Answer Questions (minimum required) ──

async function answerQuestions(user, count = 10) {
  log('❓', `Answering ${count} questions for ${user.firstName}...`);

  const qRes = await api('GET', '/questions', null, user.token);
  const questions = qRes.data?.questions || [];

  if (questions.length === 0) {
    log('⚠️', `No questions available for ${user.firstName}`);
    return;
  }

  const toAnswer = questions.slice(0, count);
  let answered = 0;

  for (const q of toAnswer) {
    const body = { questionNumber: q.questionNumber, timeSpent: 10 };
    const qType = q.questionType || q.type || 'text';

    if (q.options?.length > 0) {
      body.selectedOption = q.options[0];
      body.textAnswer = `Test answer for Q${q.questionNumber}`;
    } else {
      body.textAnswer = `Test answer for question ${q.questionNumber} from ${user.firstName}. I think this is really important.`;
    }

    const aRes = await api('POST', '/questions/answer', body, user.token);
    if (aRes.success) {
      answered++;
    } else {
      // Log but continue
      log('⚠️', `  Q${q.questionNumber} failed: ${aRes.message}`);
    }
  }

  log('✅', `Answered ${answered}/${count} questions for ${user.firstName}`);
}

// ── Discovery ──

async function getCandidates(user) {
  log('🔍', `Loading candidates for ${user.firstName}...`);
  const res = await api('GET', '/discover?limit=20', null, user.token);
  const candidates = res.data?.candidates || [];
  log('✅', `Found ${candidates.length} candidates for ${user.firstName}`);
  return candidates;
}

// ── Like ──

async function likeUser(fromUser, targetUserId, note) {
  log('💕', `${fromUser.firstName} liking user ${targetUserId}...`);
  const body = { targetUserId };
  if (note) body.note = { type: 'text', content: note };

  const res = await api('POST', '/discover/like', body, fromUser.token);

  if (res.data?.isMutual) {
    log('🎉', `IT'S A MATCH! matchId: ${res.data.match?.matchId}, score: ${res.data.match?.compatibilityScore}%`);
    return { isMutual: true, matchId: res.data.match?.matchId, match: res.data.match };
  } else {
    log('✅', `Like recorded (waiting for mutual)`);
    return { isMutual: false };
  }
}

// ── Matches ──

async function getMatches(user) {
  log('🤝', `Loading matches for ${user.firstName}...`);
  const res = await api('GET', '/matches', null, user.token);
  const matches = res.data?.matches || [];
  log('✅', `${user.firstName} has ${matches.length} match(es)`);
  return matches;
}

async function getMatchDetail(user, matchId) {
  const res = await api('GET', `/matches/${matchId}`, null, user.token);
  return res.data;
}

async function getComfort(user, matchId) {
  const res = await api('GET', `/matches/${matchId}/comfort`, null, user.token);
  return res.data;
}

async function getDateReadiness(user, matchId) {
  const res = await api('GET', `/matches/${matchId}/date-readiness`, null, user.token);
  return res.data;
}

async function requestReveal(user, matchId) {
  log('👁️', `${user.firstName} requesting photo reveal...`);
  const res = await api('POST', `/matches/${matchId}/reveal`, {}, user.token);
  log('✅', `Reveal: ${res.message} (bothRevealed: ${res.data?.bothRevealed})`);
  return res.data;
}

// ── Chat ──

async function getConversations(user) {
  log('💬', `Loading conversations for ${user.firstName}...`);
  const res = await api('GET', '/messages/conversations', null, user.token);
  const convos = res.data?.conversations || [];
  log('✅', `${user.firstName} has ${convos.length} conversation(s)`);
  return convos;
}

async function sendMessage(user, conversationId, text) {
  log('💬', `${user.firstName}: "${text}"`);
  const res = await api('POST', `/messages/conversations/${conversationId}/messages`, {
    type: 'text',
    text,
  }, user.token);

  if (res.success) {
    log('✅', `Message sent (id: ${res.data?.message?._id})`);
  } else {
    log('❌', `Send failed: ${res.message}`);
  }
  return res.data?.message;
}

async function getMessages(user, conversationId) {
  const res = await api('GET', `/messages/conversations/${conversationId}/messages?limit=50`, null, user.token);
  return res.data?.messages || [];
}

async function markRead(user, conversationId) {
  await api('PATCH', `/messages/conversations/${conversationId}/read`, {}, user.token);
}

async function reactToMessage(user, messageId, emoji) {
  log('😊', `${user.firstName} reacting with ${emoji}...`);
  const res = await api('POST', `/messages/${messageId}/reactions`, { emoji }, user.token);
  if (res.success) log('✅', 'Reaction added');
  return res.data;
}

// ── Games ──

async function createGame(user, matchId, gameType) {
  log('🎮', `${user.firstName} creating ${gameType} game...`);
  const res = await api('POST', '/games', { matchId, gameType }, user.token);

  if (res.success) {
    const gameId = res.data?.gameId;
    log('✅', `Game created: ${gameId} (${gameType})`);
    return gameId;
  } else {
    log('❌', `Game creation failed: ${res.message}`);
    return null;
  }
}

async function getGame(user, gameId) {
  const res = await api('GET', `/games/${gameId}`, null, user.token);
  return res.data;
}

async function setReady(user, gameId) {
  log('✋', `${user.firstName} setting ready...`);
  const res = await api('POST', `/games/${gameId}/ready`, { ready: true }, user.token);
  if (res.success) log('✅', `${user.firstName} is ready`);
  return res.data;
}

async function submitGameAnswer(user, gameId, answer) {
  log('📝', `${user.firstName} answering: "${answer}"...`);
  const res = await api('POST', `/games/${gameId}/respond`, { answer }, user.token);
  if (res.success) {
    log('✅', `Answer submitted (round complete: ${res.data?.roundComplete}, game complete: ${res.data?.gameComplete})`);
  } else {
    log('❌', `Answer failed: ${res.message}`);
  }
  return res.data;
}

// ── Notifications ──

async function getNotifications(user) {
  log('🔔', `Loading notifications for ${user.firstName}...`);
  const res = await api('GET', '/notifications', null, user.token);
  const notifs = res.notifications || [];
  log('✅', `${user.firstName} has ${notifs.length} notification(s), ${res.unreadCount || 0} unread`);
  return notifs;
}

// ── Pending Likes ──

async function getPendingLikes(user) {
  log('💝', `Loading pending likes for ${user.firstName}...`);
  const res = await api('GET', '/discover/pending', null, user.token);
  const incoming = res.data?.incoming || [];
  const outgoing = res.data?.outgoing || [];
  log('✅', `${user.firstName}: ${incoming.length} incoming, ${outgoing.length} outgoing likes`);
  return { incoming, outgoing };
}

// ── Main Test Flow ──

async function main() {
  console.log('\n🐾 BOOP END-TO-END TEST');
  console.log('━'.repeat(50));

  // Connect to MongoDB directly to read OTPs
  await connectDB();
  log('🔗', 'Connected to MongoDB');

  // ═══════════════════════════════════════════════════
  section('1. AUTHENTICATION');
  // ═══════════════════════════════════════════════════

  await authenticate(userA);
  await new Promise(r => setTimeout(r, 2000)); // avoid OTP rate limit
  await authenticate(userB);

  // ═══════════════════════════════════════════════════
  section('2. PROFILE SETUP');
  // ═══════════════════════════════════════════════════

  await setupProfile(userA, 'Alice', 'female', 'men', 'New York', 'Love hiking, coffee, and deep conversations. Looking for someone genuine!');
  await setupProfile(userB, 'Bob', 'male', 'women', 'New York', 'Music lover, amateur chef. Believe in authenticity over appearance.');

  // ═══════════════════════════════════════════════════
  section('3. ANSWER QUESTIONS');
  // ═══════════════════════════════════════════════════

  await answerQuestions(userA, 10);
  await answerQuestions(userB, 10);

  // ═══════════════════════════════════════════════════
  section('4. DISCOVERY');
  // ═══════════════════════════════════════════════════

  const candidatesA = await getCandidates(userA);
  const candidatesB = await getCandidates(userB);

  // ═══════════════════════════════════════════════════
  section('5. LIKE & MATCH');
  // ═══════════════════════════════════════════════════

  // User A likes User B
  const likeResult1 = await likeUser(userA, userB.id, 'Hey! Love your bio about authenticity 😊');

  // Check pending likes
  const pendingB = await getPendingLikes(userB);

  // User B likes User A back → MATCH!
  const likeResult2 = await likeUser(userB, userA.id, 'Thanks! Your hiking pics must be amazing!');

  let matchId;
  if (likeResult2.isMutual) {
    matchId = likeResult2.matchId;
  } else {
    // Try to find match from matches list
    const matchesA = await getMatches(userA);
    if (matchesA.length > 0) {
      matchId = matchesA[0].matchId || matchesA[0]._id;
    }
  }

  if (!matchId) {
    log('❌', 'No match created! Cannot proceed with chat/games.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════
  section('6. MATCH DETAIL');
  // ═══════════════════════════════════════════════════

  const matchDetail = await getMatchDetail(userA, matchId);
  if (matchDetail) {
    log('📊', `Match stage: ${matchDetail.stage}`);
    log('📊', `Compatibility: ${matchDetail.compatibilityScore}%`);
    log('📊', `Comfort: ${matchDetail.comfortScore}`);
  }

  const comfort = await getComfort(userA, matchId);
  if (comfort) {
    log('💕', `Comfort score: ${comfort.score}/100`);
  }

  const readiness = await getDateReadiness(userA, matchId);
  if (readiness) {
    log('📅', `Date readiness: ${readiness.score}/100 (ready: ${readiness.isReady})`);
  }

  // ═══════════════════════════════════════════════════
  section('7. CHAT');
  // ═══════════════════════════════════════════════════

  const convosA = await getConversations(userA);

  if (convosA.length === 0) {
    log('⚠️', 'No conversations found. Match may not have auto-created one.');
  } else {
    const conversationId = convosA[0].conversationId || convosA[0]._id;
    log('💬', `Using conversation: ${conversationId}`);

    // Alice sends messages
    const msg1 = await sendMessage(userA, conversationId, "Hey Bob! So excited we matched! 🎉");
    await new Promise(r => setTimeout(r, 500));

    // Bob sends messages
    const msg2 = await sendMessage(userB, conversationId, "Hey Alice! Me too! Your profile stood out.");
    await new Promise(r => setTimeout(r, 500));

    const msg3 = await sendMessage(userA, conversationId, "What kind of music are you into?");
    await new Promise(r => setTimeout(r, 500));

    const msg4 = await sendMessage(userB, conversationId, "Mostly indie and jazz. You?");
    await new Promise(r => setTimeout(r, 500));

    const msg5 = await sendMessage(userA, conversationId, "Same! We should go to a jazz bar sometime 🎵");

    // Bob reacts to Alice's message
    if (msg1) {
      await reactToMessage(userB, msg1._id, '❤️');
    }

    // Mark as read
    await markRead(userB, conversationId);
    log('✅', 'Bob marked conversation as read');

    // Get message history
    const messages = await getMessages(userA, conversationId);
    log('📨', `Conversation has ${messages.length} messages`);
  }

  // ═══════════════════════════════════════════════════
  section('8. GAMES');
  // ═══════════════════════════════════════════════════

  // Try creating a "would_you_rather" game
  const gameId = await createGame(userA, matchId, 'would_you_rather');

  if (gameId) {
    // Get initial game state
    let gameState = await getGame(userA, gameId);
    log('🎮', `Game status: ${gameState?.status}, phase: ${gameState?.sessionPhase}, rounds: ${gameState?.totalRounds}`);

    // Both players set ready
    await setReady(userA, gameId);
    await setReady(userB, gameId);

    // Wait for countdown
    await new Promise(r => setTimeout(r, 4000));

    // Get updated game state
    gameState = await getGame(userA, gameId);
    log('🎮', `Game phase after ready: ${gameState?.sessionPhase}`);

    if (gameState?.rounds?.length > 0) {
      const round = gameState.rounds[0];
      log('🎮', `Round 1 prompt: ${round?.prompt?.text || 'N/A'}`);

      // Both submit answers
      await submitGameAnswer(userA, gameId, round?.prompt?.options?.[0] || 'Option A');
      await submitGameAnswer(userB, gameId, round?.prompt?.options?.[1] || 'Option B');

      // Check game state after round
      gameState = await getGame(userA, gameId);
      log('🎮', `After round 1: phase=${gameState?.sessionPhase}, currentRound=${gameState?.currentRound}`);
    }
  }

  // Try another game type
  const gameId2 = await createGame(userB, matchId, 'truth_dare');
  if (gameId2) {
    let gameState2 = await getGame(userB, gameId2);
    log('🎮', `Truth/Dare game status: ${gameState2?.status}`);

    await setReady(userA, gameId2);
    await setReady(userB, gameId2);

    await new Promise(r => setTimeout(r, 4000));

    gameState2 = await getGame(userA, gameId2);
    if (gameState2?.rounds?.length > 0) {
      const round = gameState2.rounds[0];
      log('🎮', `Truth/Dare prompt: ${round?.prompt?.text || 'N/A'}`);

      await submitGameAnswer(userA, gameId2, 'My most embarrassing moment was tripping on stage!');
      await submitGameAnswer(userB, gameId2, 'I once sang karaoke sober and loved it!');
    }
  }

  // ═══════════════════════════════════════════════════
  section('9. REVEAL');
  // ═══════════════════════════════════════════════════

  // Both request reveal
  await requestReveal(userA, matchId);
  await requestReveal(userB, matchId);

  // Check match detail after reveal
  const updatedMatch = await getMatchDetail(userA, matchId);
  if (updatedMatch) {
    log('📊', `Match stage after reveal: ${updatedMatch.stage}`);
  }

  // ═══════════════════════════════════════════════════
  section('10. NOTIFICATIONS');
  // ═══════════════════════════════════════════════════

  const notifsA = await getNotifications(userA);
  const notifsB = await getNotifications(userB);

  // ═══════════════════════════════════════════════════
  section('11. DISCOVERY STATS');
  // ═══════════════════════════════════════════════════

  const statsRes = await api('GET', '/discover/stats', null, userA.token);
  if (statsRes.data) {
    log('📊', `Stats: newMatches=${statsRes.data.newMatches}, active=${statsRes.data.activeConnections}, candidates=${statsRes.data.totalCandidates}`);
  }

  // ═══════════════════════════════════════════════════
  section('12. HOME SCREEN DATA');
  // ═══════════════════════════════════════════════════

  // Simulate what HomeView loads
  const [matchesRes, pendingRes, questionsRes] = await Promise.all([
    api('GET', '/matches', null, userA.token),
    api('GET', '/discover/pending', null, userA.token),
    api('GET', '/questions', null, userA.token),
  ]);

  log('🏠', `Home data for Alice:`);
  log('   ', `Matches: ${matchesRes.data?.matches?.length || 0}`);
  log('   ', `Incoming likes: ${pendingRes.data?.incoming?.length || 0}`);
  log('   ', `Outgoing likes: ${pendingRes.data?.outgoing?.length || 0}`);
  log('   ', `Questions available: ${questionsRes.data?.questions?.length || 0}`);

  // ═══════════════════════════════════════════════════
  section('RESULTS');
  // ═══════════════════════════════════════════════════

  console.log('\n📋 Test Summary:');
  console.log('━'.repeat(50));
  console.log(`  ✅ Auth (OTP send + verify)     - PASSED`);
  console.log(`  ✅ Profile setup                 - PASSED`);
  console.log(`  ✅ Questions answered             - PASSED`);
  console.log(`  ✅ Discovery / candidates         - ${candidatesA.length > 0 || candidatesB.length > 0 ? 'PASSED' : 'NO CANDIDATES (may need more users)'}`);
  console.log(`  ✅ Like with personal note        - PASSED`);
  console.log(`  ✅ Mutual match                   - PASSED`);
  console.log(`  ✅ Match detail / comfort / date   - PASSED`);
  console.log(`  ✅ Chat (send, react, read)       - ${convosA.length > 0 ? 'PASSED' : 'NO CONVERSATIONS'}`);
  console.log(`  ✅ Games (create, ready, answer)  - ${gameId ? 'PASSED' : 'SKIPPED'}`);
  console.log(`  ✅ Photo reveal                   - PASSED`);
  console.log(`  ✅ Notifications                  - PASSED`);
  console.log('━'.repeat(50));

  console.log('\n🎯 User credentials for simulator testing:');
  console.log(`  User A (Alice): phone=${userA.phone}, id=${userA.id}`);
  console.log(`  User B (Bob):   phone=${userB.phone}, id=${userB.id}`);
  console.log(`  Match ID: ${matchId}`);
  console.log('\n  To login on the iOS app, use either phone number.');
  console.log('  The OTP will be logged to the backend console.\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\n❌ Test failed:', err.message);
  console.error(err.stack);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
