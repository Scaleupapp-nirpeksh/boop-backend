#!/usr/bin/env node

/**
 * PRODUCTION RESET — wipe everything except one keeper user.
 *
 * Keeps:
 *   - The keeper user (phone ends 8800237144, _id 69b1523c1a63014358e3d9ee)
 *   - The keeper's answers and personality analyses
 *   - The ENTIRE question catalog (questions collection is never touched)
 *
 * Deletes:
 *   - All other users, their answers and personality analyses
 *   - ALL: matches, conversations, messages, interactions, games,
 *     notifications, scoresnapshots, dateplans, reports, blocks,
 *     moderationflags, otps
 *
 * Hard guards:
 *   - Requires --confirm. Without it, prints a dry-run plan and exits 1.
 *   - Looks up the keeper by phone suffix and ABORTS unless the found
 *     user's _id matches the expected keeper id exactly.
 *   - Only operates on explicitly named models — never iterates or drops
 *     unknown collections.
 *
 * Usage:
 *   node scripts/resetKeepUser.js            # dry run (prints plan, exit 1)
 *   node scripts/resetKeepUser.js --confirm  # actually delete
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Explicit model requires — the only collections this script touches.
const User = require('../src/models/User');
const Answer = require('../src/models/Answer');
const PersonalityAnalysis = require('../src/models/PersonalityAnalysis');
const Match = require('../src/models/Match');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const Interaction = require('../src/models/Interaction');
const Game = require('../src/models/Game');
const Notification = require('../src/models/Notification');
const ScoreSnapshot = require('../src/models/ScoreSnapshot');
const DatePlan = require('../src/models/DatePlan');
const Report = require('../src/models/Report');
const Block = require('../src/models/Block');
const ModerationFlag = require('../src/models/ModerationFlag');
const OTP = require('../src/models/OTP');
const Question = require('../src/models/Question'); // counted only — NEVER deleted

const KEEPER_PHONE_SUFFIX = /8800237144$/;
const EXPECTED_KEEPER_ID = '69b1523c1a63014358e3d9ee';
const CONFIRM = process.argv.includes('--confirm');

async function flushCaches() {
  // Best-effort: clear engine caches so the live app doesn't serve stale data.
  try {
    const { connectRedis, closeRedis } = require('../src/config/redis');
    const cache = require('../src/utils/cache');
    const client = await connectRedis();
    if (!client) {
      console.log('Cache flush skipped (no Redis connection)');
      return;
    }
    await cache.invalidatePattern('compat:*');
    await cache.invalidatePattern('showcase:*');
    await cache.invalidatePattern('discover:stats:*');
    await cache.invalidatePattern('questions:available:*');
    await cache.invalidate('archetype:distribution');
    await closeRedis();
    console.log('Caches flushed: compat:*, showcase:*, discover:stats:*, questions:available:*, archetype:distribution');
  } catch (err) {
    console.log(`Cache flush skipped (non-fatal): ${err.message}`);
  }
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('ABORT: MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // ─── Hard guards ─────────────────────────────────────────────────
  const keeper = await User.findOne({ phone: KEEPER_PHONE_SUFFIX }).lean();
  if (!keeper) {
    console.error('ABORT: keeper user (phone *8800237144) not found — refusing to delete anything.');
    await mongoose.disconnect();
    process.exit(1);
  }
  if (keeper._id.toString() !== EXPECTED_KEEPER_ID) {
    console.error(
      `ABORT: keeper id mismatch. Found ${keeper._id} but expected ${EXPECTED_KEEPER_ID} — refusing to delete anything.`
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(
    `Keeper verified: ${keeper.firstName} ${keeper.phone} (${keeper._id}) — stage=${keeper.profileStage}, answers=${keeper.questionsAnswered}`
  );

  // ─── Deletion plan (explicit, per named model) ───────────────────
  const plan = [
    { label: 'users (except keeper)', model: User, filter: { _id: { $ne: keeper._id } } },
    { label: 'answers (except keeper)', model: Answer, filter: { userId: { $ne: keeper._id } } },
    { label: 'personalityanalyses (except keeper)', model: PersonalityAnalysis, filter: { userId: { $ne: keeper._id } } },
    { label: 'matches (ALL)', model: Match, filter: {} },
    { label: 'conversations (ALL)', model: Conversation, filter: {} },
    { label: 'messages (ALL)', model: Message, filter: {} },
    { label: 'interactions (ALL)', model: Interaction, filter: {} },
    { label: 'games (ALL)', model: Game, filter: {} },
    { label: 'notifications (ALL)', model: Notification, filter: {} },
    { label: 'scoresnapshots (ALL)', model: ScoreSnapshot, filter: {} },
    { label: 'dateplans (ALL)', model: DatePlan, filter: {} },
    { label: 'reports (ALL)', model: Report, filter: {} },
    { label: 'blocks (ALL)', model: Block, filter: {} },
    { label: 'moderationflags (ALL)', model: ModerationFlag, filter: {} },
    { label: 'otps (ALL)', model: OTP, filter: {} },
  ];

  if (!CONFIRM) {
    console.log('\nDRY RUN (no --confirm). Would delete:');
    for (const step of plan) {
      const n = await step.model.countDocuments(step.filter);
      console.log(`  ${step.label}: ${n}`);
    }
    const qCount = await Question.countDocuments({});
    console.log(`  questions: 0 (KEPT — catalog of ${qCount})`);
    console.log('\nRe-run with --confirm to execute.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // ─── Execute ─────────────────────────────────────────────────────
  console.log('\nDeleting...');
  for (const step of plan) {
    const res = await step.model.deleteMany(step.filter);
    console.log(`  ${step.label}: deleted ${res.deletedCount}`);
  }

  // ─── Final counts ────────────────────────────────────────────────
  console.log('\nFinal counts:');
  const countModels = [
    ['users', User],
    ['answers', Answer],
    ['personalityanalyses', PersonalityAnalysis],
    ['matches', Match],
    ['conversations', Conversation],
    ['messages', Message],
    ['interactions', Interaction],
    ['games', Game],
    ['notifications', Notification],
    ['scoresnapshots', ScoreSnapshot],
    ['dateplans', DatePlan],
    ['reports', Report],
    ['blocks', Block],
    ['moderationflags', ModerationFlag],
    ['otps', OTP],
    ['questions (kept)', Question],
  ];
  for (const [label, model] of countModels) {
    const n = await model.countDocuments({});
    console.log(`  ${label}: ${n}`);
  }
  const keeperAnswers = await Answer.countDocuments({ userId: keeper._id });
  const keeperAnalyses = await PersonalityAnalysis.countDocuments({ userId: keeper._id });
  console.log(`  keeper answers: ${keeperAnswers}, keeper analyses: ${keeperAnalyses}`);

  await flushCaches();

  await mongoose.disconnect();
  console.log('\nReset complete. Keeper untouched.');
  process.exit(0);
}

main().catch(async (err) => {
  console.error('RESET FAILED:', err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
