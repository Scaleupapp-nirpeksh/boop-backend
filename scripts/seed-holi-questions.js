/**
 * Seed Holi 2026 seasonal questions
 * Low weight (0.3) — used in analysis but not high impact on matching
 * Run: node scripts/seed-holi-questions.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('../src/models/Question');

const holiQuestions = [
  {
    questionNumber: 61,
    dimension: 'emotional_vulnerability',
    depthLevel: 'surface',
    questionText: "What's your most colourful memory with someone special?",
    questionType: 'text',
    characterLimit: 500,
    followUpQuestion: 'What made that moment so vivid?',
    dayAvailable: 1,
    order: 100,
    weight: 0.3,
    season: 'holi_2026',
    analysisPrompt: 'Analyse the emotional depth and nostalgia in this memory. What does it reveal about how they bond with people?',
  },
  {
    questionNumber: 62,
    dimension: 'lifestyle_rhythm',
    depthLevel: 'surface',
    questionText: 'Do you prefer celebrating festivals in a crowd or with one person?',
    questionType: 'single_choice',
    options: [
      'Big crowd — the more the merrier!',
      'Small group of close friends',
      'Just one special person',
      'Honestly, I like celebrating solo',
      'Depends on my mood that day',
    ],
    dayAvailable: 1,
    order: 101,
    weight: 0.3,
    season: 'holi_2026',
    analysisPrompt: 'This reveals social energy preferences. Does this person recharge in crowds or intimate settings?',
  },
  {
    questionNumber: 63,
    dimension: 'love_expression',
    depthLevel: 'moderate',
    questionText: 'What tradition would you want to share with a partner?',
    questionType: 'text',
    characterLimit: 500,
    followUpQuestion: 'Why does this tradition matter to you?',
    dayAvailable: 1,
    order: 102,
    weight: 0.3,
    season: 'holi_2026',
    analysisPrompt: 'Analyse what this tradition reveals about their love language and cultural values. How do they envision shared rituals?',
  },
  {
    questionNumber: 64,
    dimension: 'intimacy_comfort',
    depthLevel: 'moderate',
    questionText: 'Someone playfully throws colour at you at a Holi party. How do you react?',
    questionType: 'single_choice',
    options: [
      'Throw it right back — game on! 🎨',
      'Laugh and go with the flow',
      'Smile but quietly step back',
      'Depends on who threw it 👀',
      "I'd rather watch from the sidelines",
    ],
    dayAvailable: 1,
    order: 103,
    weight: 0.3,
    season: 'holi_2026',
    analysisPrompt: 'This reveals comfort with spontaneity, physical closeness, and playfulness. How open are they to unplanned intimate moments?',
  },
  {
    questionNumber: 65,
    dimension: 'life_vision',
    depthLevel: 'surface',
    questionText: "What's one thing you'd want to experience with a future partner during a festival?",
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 1,
    order: 104,
    weight: 0.3,
    season: 'holi_2026',
    analysisPrompt: 'Analyse what this reveals about their romantic imagination and how they picture shared experiences with a partner.',
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const q of holiQuestions) {
      const exists = await Question.findOne({ questionNumber: q.questionNumber });
      if (exists) {
        console.log(`Question ${q.questionNumber} already exists, skipping`);
        continue;
      }
      await Question.create(q);
      console.log(`Created question ${q.questionNumber}: ${q.questionText.substring(0, 50)}...`);
    }

    console.log('\nDone! Seeded Holi 2026 questions (weight: 0.3)');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

seed();
