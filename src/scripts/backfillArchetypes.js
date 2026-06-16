/**
 * Backfill archetypeCode on completed personality analyses that predate the
 * archetype feature (archetypeCode null/missing) so they render a Type instead
 * of "no type". Uses the service's deterministic facet-based resolver — no
 * OpenAI calls — so it is cheap, stable, and idempotent.
 *
 * Usage: node src/scripts/backfillArchetypes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const PersonalityAnalysis = require('../models/PersonalityAnalysis');
const PersonalityService = require('../services/personality.service');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const stale = await PersonalityAnalysis.find({
    status: 'completed',
    $or: [{ archetypeCode: null }, { archetypeCode: { $exists: false } }],
  });

  console.log(`Found ${stale.length} completed analyses missing an archetype code.`);
  let fixed = 0;

  for (const doc of stale) {
    const archetype = PersonalityService._resolveArchetype({
      archetypeCode: doc.archetypeCode,
      facets: doc.facets,
    });
    if (archetype && archetype.code) {
      doc.archetypeCode = archetype.code;
      await doc.save();
      fixed += 1;
      console.log(`  user=${doc.userId} triggeredAt=${doc.triggeredAtCount} -> ${archetype.code} (${archetype.name})`);
    }
  }

  console.log(`Backfilled ${fixed}/${stale.length} analyses.`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
