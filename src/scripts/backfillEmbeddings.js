#!/usr/bin/env node

/**
 * One-time migration script: backfill embeddings for existing text answers.
 *
 * Usage:
 *   node src/scripts/backfillEmbeddings.js
 *   node src/scripts/backfillEmbeddings.js --batch-size=50 --dry-run
 *
 * Options:
 *   --batch-size=N   Number of answers per OpenAI batch call (default: 50, max: 2048)
 *   --dry-run        Print what would be done without calling OpenAI or saving
 */

require('dotenv').config();

const mongoose = require('mongoose');
const Answer = require('../models/Answer');
const EmbeddingService = require('../services/embedding.service');
const logger = require('../utils/logger');

// Parse CLI args
const args = process.argv.slice(2);
const BATCH_SIZE = parseInt(args.find((a) => a.startsWith('--batch-size='))?.split('=')[1] || '50', 10);
const DRY_RUN = args.includes('--dry-run');

const run = async () => {
  // Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI not set in environment');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY && !DRY_RUN) {
    console.error('OPENAI_API_KEY not set in environment');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  logger.info('Connected to MongoDB');

  // Find all text answers without embeddings
  // Use .select('+embedding') to include the normally-excluded field
  const answers = await Answer.find({
    textAnswer: { $exists: true, $ne: null, $ne: '' },
  })
    .select('+embedding')
    .lean();

  // Filter to only those without embeddings
  const needsEmbedding = answers.filter(
    (a) => !a.embedding || a.embedding.length === 0
  );

  logger.info(`Total text answers: ${answers.length}`);
  logger.info(`Already have embeddings: ${answers.length - needsEmbedding.length}`);
  logger.info(`Need embeddings: ${needsEmbedding.length}`);

  if (needsEmbedding.length === 0) {
    logger.info('Nothing to backfill — all text answers already have embeddings.');
    await mongoose.disconnect();
    return;
  }

  if (DRY_RUN) {
    logger.info(`[DRY RUN] Would generate embeddings for ${needsEmbedding.length} answers in batches of ${BATCH_SIZE}`);
    await mongoose.disconnect();
    return;
  }

  // Process in batches
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < needsEmbedding.length; i += BATCH_SIZE) {
    const batch = needsEmbedding.slice(i, i + BATCH_SIZE);
    const texts = batch.map((a) => a.textAnswer);

    logger.info(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(needsEmbedding.length / BATCH_SIZE)} (${batch.length} answers)...`);

    try {
      const embeddings = await EmbeddingService.batchGenerateEmbeddings(texts);

      // Save each embedding
      const ops = [];
      for (let j = 0; j < batch.length; j++) {
        if (embeddings[j]) {
          ops.push({
            updateOne: {
              filter: { _id: batch[j]._id },
              update: { $set: { embedding: embeddings[j] } },
            },
          });
          processed++;
        } else {
          failed++;
          logger.warn(`Failed to generate embedding for answer ${batch[j]._id}`);
        }
      }

      if (ops.length > 0) {
        await Answer.bulkWrite(ops);
      }

      logger.info(`Batch complete: ${processed} saved, ${failed} failed`);

      // Rate limit: small delay between batches to avoid API throttling
      if (i + BATCH_SIZE < needsEmbedding.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      logger.error(`Batch failed:`, err.message);
      failed += batch.length;
    }
  }

  logger.info('===========================================');
  logger.info(`Backfill complete`);
  logger.info(`  Processed: ${processed}`);
  logger.info(`  Failed:    ${failed}`);
  logger.info(`  Total:     ${needsEmbedding.length}`);
  logger.info('===========================================');

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Backfill script failed:', err);
  process.exit(1);
});
