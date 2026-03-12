/**
 * Seed all seasonal questions (excluding Holi which is already seeded)
 * Low weight (0.3) — used in analysis but low impact on matching
 * Run: node scripts/seed-seasonal-questions.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('../src/models/Question');

const seasonalQuestions = [
  // ── Valentine's 2026 (Feb 7-21) ──
  {
    questionNumber: 66,
    dimension: 'love_expression',
    depthLevel: 'surface',
    questionText: "What's the most romantic gesture you've ever received or given?",
    questionType: 'text',
    characterLimit: 500,
    followUpQuestion: 'What made it feel special?',
    dayAvailable: 1, order: 110, weight: 0.3,
    season: 'valentines_2026',
    analysisPrompt: 'Analyse their love language — do they value grand gestures or small, thoughtful acts? What does this reveal about how they give and receive love?',
  },
  {
    questionNumber: 67,
    dimension: 'intimacy_comfort',
    depthLevel: 'moderate',
    questionText: "What's your ideal Valentine's Day — even if you think the holiday is silly?",
    questionType: 'single_choice',
    options: [
      'Cozy night in — cooking together, candles, movies',
      'Fancy dinner and dressing up',
      'An adventure — travel, hiking, something unexpected',
      'Handwritten letters and meaningful gifts',
      'Anti-Valentine\'s — celebrate friendships instead',
      'Honestly, just a normal day with someone I love',
    ],
    dayAvailable: 1, order: 111, weight: 0.3,
    season: 'valentines_2026',
    analysisPrompt: 'This reveals romantic style and comfort with traditional expressions of love vs. creating their own traditions.',
  },
  {
    questionNumber: 68,
    dimension: 'emotional_vulnerability',
    depthLevel: 'moderate',
    questionText: "What's one thing you wish someone understood about how you love?",
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 1, order: 112, weight: 0.3,
    season: 'valentines_2026',
    analysisPrompt: 'Deep insight into their emotional needs and where they feel misunderstood in relationships. Key vulnerability indicator.',
  },
  {
    questionNumber: 69,
    dimension: 'attachment_patterns',
    depthLevel: 'deep',
    questionText: 'When you start falling for someone, what scares you most?',
    questionType: 'single_choice',
    options: [
      'That they won\'t feel the same way',
      'Losing my independence',
      'Getting hurt again',
      'Not being enough for them',
      'Moving too fast and ruining it',
      'Nothing — I just go with the flow',
    ],
    dayAvailable: 1, order: 113, weight: 0.3,
    season: 'valentines_2026',
    analysisPrompt: 'Strong attachment pattern indicator. Reveals avoidant vs anxious tendencies and core relationship fears.',
  },
  {
    questionNumber: 70,
    dimension: 'life_vision',
    depthLevel: 'surface',
    questionText: "Do you believe in 'the one' or do you think love is a choice you make every day?",
    questionType: 'single_choice',
    options: [
      'Definitely believe in the one',
      'Mostly destiny, but timing matters',
      'It\'s a mix of both',
      'Love is mostly a daily choice',
      'I think there are many potential matches',
    ],
    dayAvailable: 1, order: 114, weight: 0.3,
    season: 'valentines_2026',
    analysisPrompt: 'Reveals romantic worldview — destiny vs growth mindset in relationships. Important for long-term compatibility.',
  },

  // ── Summer 2026 (May 1-31) ──
  {
    questionNumber: 71,
    dimension: 'lifestyle_rhythm',
    depthLevel: 'surface',
    questionText: "What's your perfect summer weekend with someone you're dating?",
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 1, order: 120, weight: 0.3,
    season: 'summer_2026',
    analysisPrompt: 'Reveals lifestyle preferences, energy levels, and how they envision shared leisure time.',
  },
  {
    questionNumber: 72,
    dimension: 'intimacy_comfort',
    depthLevel: 'surface',
    questionText: 'Beach vacation or mountain getaway?',
    questionType: 'single_choice',
    options: [
      'Beach — sun, sand, and waves',
      'Mountains — cool air and adventure',
      'City trip — culture, food, nightlife',
      'Staycation — anywhere with the right person',
      'Road trip — the journey IS the destination',
    ],
    dayAvailable: 1, order: 121, weight: 0.3,
    season: 'summer_2026',
    analysisPrompt: 'Light but reveals lifestyle compatibility — adventure vs relaxation preference, introvert vs extrovert travel style.',
  },
  {
    questionNumber: 73,
    dimension: 'emotional_vulnerability',
    depthLevel: 'moderate',
    questionText: "What's a summer memory that still makes you smile?",
    questionType: 'text',
    characterLimit: 500,
    followUpQuestion: 'Who were you with?',
    dayAvailable: 1, order: 122, weight: 0.3,
    season: 'summer_2026',
    analysisPrompt: 'Nostalgia and emotional warmth indicator. What kind of experiences do they treasure?',
  },
  {
    questionNumber: 74,
    dimension: 'growth_mindset',
    depthLevel: 'surface',
    questionText: "What's something you want to try this summer that you've never done before?",
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 1, order: 123, weight: 0.3,
    season: 'summer_2026',
    analysisPrompt: 'Openness to new experiences and growth orientation. Are they a planner or spontaneous adventurer?',
  },
  {
    questionNumber: 75,
    dimension: 'love_expression',
    depthLevel: 'surface',
    questionText: 'How do you handle the heat?',
    questionType: 'single_choice',
    options: [
      'AC on full blast, staying indoors',
      'Ice cream solves everything 🍦',
      'Late night walks when it cools down',
      'Pool or beach — water is the answer',
      'I actually love the heat!',
    ],
    dayAvailable: 1, order: 124, weight: 0.3,
    season: 'summer_2026',
    analysisPrompt: 'Light personality reveal — adaptability and lifestyle preferences.',
  },

  // ── Monsoon 2026 (Jul 1-31) ──
  {
    questionNumber: 76,
    dimension: 'emotional_vulnerability',
    depthLevel: 'moderate',
    questionText: "There's something about rainy days that makes people reflective. What do you think about when it rains?",
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 1, order: 130, weight: 0.3,
    season: 'monsoon_2026',
    analysisPrompt: 'Deep emotional introspection. Rain as a prompt for vulnerability — what surfaces when they slow down?',
  },
  {
    questionNumber: 77,
    dimension: 'lifestyle_rhythm',
    depthLevel: 'surface',
    questionText: 'Perfect monsoon date?',
    questionType: 'single_choice',
    options: [
      'Chai and pakoras at a window café',
      'Getting drenched together — why not!',
      'Binge-watching a series under a blanket',
      'Long drive with the windows down',
      'Cooking something warm together at home',
    ],
    dayAvailable: 1, order: 131, weight: 0.3,
    season: 'monsoon_2026',
    analysisPrompt: 'Reveals romantic style and comfort level — cozy homebody vs adventurous, spontaneous vs planned.',
  },
  {
    questionNumber: 78,
    dimension: 'attachment_patterns',
    depthLevel: 'deep',
    questionText: "Do rainy days make you want company or solitude?",
    questionType: 'single_choice',
    options: [
      'Company — I want someone to share it with',
      'Solitude — it\'s my recharge time',
      'Company first, then some alone time',
      'Depends on who the company is',
      'I never really thought about it',
    ],
    dayAvailable: 1, order: 132, weight: 0.3,
    season: 'monsoon_2026',
    analysisPrompt: 'Attachment and social battery indicator. Reveals need for closeness vs independence in quiet moments.',
  },
  {
    questionNumber: 79,
    dimension: 'love_expression',
    depthLevel: 'moderate',
    questionText: "What song hits different during the monsoon?",
    questionType: 'text',
    characterLimit: 300,
    followUpQuestion: 'What memory does it bring back?',
    dayAvailable: 1, order: 133, weight: 0.3,
    season: 'monsoon_2026',
    analysisPrompt: 'Music taste + emotional association. What does their song choice reveal about their romantic side?',
  },
  {
    questionNumber: 80,
    dimension: 'life_vision',
    depthLevel: 'surface',
    questionText: "Umbrellas: share one or bring your own?",
    questionType: 'single_choice',
    options: [
      'Share — obviously, it\'s romantic!',
      'Bring my own — I like being prepared',
      'Skip the umbrella — dance in the rain',
      'I\'ll hold it for them',
      'Whoever has one, the other gets close',
    ],
    dayAvailable: 1, order: 134, weight: 0.3,
    season: 'monsoon_2026',
    analysisPrompt: 'Playful but reveals care style — protective, independent, spontaneous, or romantic.',
  },

  // ── Diwali 2026 (Oct 15 - Nov 5) ──
  {
    questionNumber: 81,
    dimension: 'life_vision',
    depthLevel: 'surface',
    questionText: "What does 'home' feel like to you during festivals?",
    questionType: 'text',
    characterLimit: 500,
    followUpQuestion: 'Is that something you want to recreate with a partner?',
    dayAvailable: 1, order: 140, weight: 0.3,
    season: 'diwali_2026',
    analysisPrompt: 'Family values and emotional attachment to traditions. Key insight into what "home" means to them in a relationship.',
  },
  {
    questionNumber: 82,
    dimension: 'love_expression',
    depthLevel: 'surface',
    questionText: "What's your Diwali love language?",
    questionType: 'single_choice',
    options: [
      'Thoughtful gifts — I spend weeks choosing',
      'Quality time — festivals are for being together',
      'Acts of service — I help with all the prep',
      'Words — I call everyone I care about',
      'Physical — hugs, diyas lit together, closeness',
    ],
    dayAvailable: 1, order: 141, weight: 0.3,
    season: 'diwali_2026',
    analysisPrompt: 'Direct love language mapping through a cultural lens. How do they show care during meaningful occasions?',
  },
  {
    questionNumber: 83,
    dimension: 'emotional_vulnerability',
    depthLevel: 'moderate',
    questionText: "Is there a Diwali from your past that changed how you see family or love?",
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 1, order: 142, weight: 0.3,
    season: 'diwali_2026',
    analysisPrompt: 'Formative emotional experience tied to family and belonging. Reveals depth of emotional processing.',
  },
  {
    questionNumber: 84,
    dimension: 'conflict_resolution',
    depthLevel: 'moderate',
    questionText: 'Festivals often bring family drama. How do you handle it?',
    questionType: 'single_choice',
    options: [
      'I\'m the peacemaker — I smooth things over',
      'I stay out of it — not my battle',
      'I speak up if something bothers me',
      'I focus on the good parts and ignore the rest',
      'I vent later to someone I trust',
    ],
    dayAvailable: 1, order: 143, weight: 0.3,
    season: 'diwali_2026',
    analysisPrompt: 'Conflict resolution style in family context — directly maps to how they\'ll handle relationship conflicts.',
  },
  {
    questionNumber: 85,
    dimension: 'growth_mindset',
    depthLevel: 'surface',
    questionText: "Firecrackers: love them or wish they'd stop?",
    questionType: 'single_choice',
    options: [
      'Love the noise and energy!',
      'A few sparklers are perfect',
      'Prefer a quiet, eco-friendly celebration',
      'I like watching from a distance',
      'Light them ALL — it\'s Diwali!',
    ],
    dayAvailable: 1, order: 144, weight: 0.3,
    season: 'diwali_2026',
    analysisPrompt: 'Values indicator — tradition vs environmental consciousness, introvert vs extrovert energy.',
  },

  // ── Christmas 2026 (Dec 15-31) ──
  {
    questionNumber: 86,
    dimension: 'love_expression',
    depthLevel: 'surface',
    questionText: "What's the most thoughtful gift you've ever given or received?",
    questionType: 'text',
    characterLimit: 500,
    followUpQuestion: 'What made it meaningful?',
    dayAvailable: 1, order: 150, weight: 0.3,
    season: 'christmas_2026',
    analysisPrompt: 'Gifting philosophy reveals care style — sentimental vs practical, planner vs spontaneous.',
  },
  {
    questionNumber: 87,
    dimension: 'lifestyle_rhythm',
    depthLevel: 'surface',
    questionText: 'How do you spend the week between Christmas and New Year?',
    questionType: 'single_choice',
    options: [
      'Party hopping — it\'s the best week of the year',
      'Cozy hibernation mode at home',
      'Travelling somewhere new',
      'Catching up with friends I haven\'t seen all year',
      'Reflecting on the year and planning the next',
    ],
    dayAvailable: 1, order: 151, weight: 0.3,
    season: 'christmas_2026',
    analysisPrompt: 'Year-end energy and social preferences. Reveals whether they\'re reflective or celebratory by nature.',
  },
  {
    questionNumber: 88,
    dimension: 'emotional_vulnerability',
    depthLevel: 'deep',
    questionText: "End of the year — what's one thing you're grateful for and one thing you want to let go of?",
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 1, order: 152, weight: 0.3,
    season: 'christmas_2026',
    analysisPrompt: 'Emotional maturity and self-awareness. Gratitude and release both indicate growth mindset and emotional health.',
  },
  {
    questionNumber: 89,
    dimension: 'attachment_patterns',
    depthLevel: 'moderate',
    questionText: 'New Year countdown: who do you want next to you?',
    questionType: 'single_choice',
    options: [
      'My person — midnight kiss is non-negotiable',
      'My closest friends — they\'re my chosen family',
      'Family — traditions matter',
      'Honestly, I\'d be happy alone with my thoughts',
      'Whoever I\'m vibing with that night',
    ],
    dayAvailable: 1, order: 153, weight: 0.3,
    season: 'christmas_2026',
    analysisPrompt: 'Who they want in meaningful moments reveals attachment priorities — romantic partner vs friends vs family vs self.',
  },
  {
    questionNumber: 90,
    dimension: 'growth_mindset',
    depthLevel: 'surface',
    questionText: "New Year's resolutions: do you make them?",
    questionType: 'single_choice',
    options: [
      'Every year — and I actually keep them',
      'I make them but they fade by February',
      'I set intentions, not resolutions',
      'Nope — I work on myself all year round',
      'I make anti-resolutions — things to do MORE of',
    ],
    dayAvailable: 1, order: 154, weight: 0.3,
    season: 'christmas_2026',
    analysisPrompt: 'Self-improvement orientation and follow-through. Reveals discipline, self-awareness, and approach to personal growth.',
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    let created = 0;
    let skipped = 0;

    for (const q of seasonalQuestions) {
      const exists = await Question.findOne({ questionNumber: q.questionNumber });
      if (exists) {
        console.log(`  Skipped Q${q.questionNumber} (exists)`);
        skipped++;
        continue;
      }
      await Question.create(q);
      console.log(`  ✓ Q${q.questionNumber} [${q.season}] ${q.questionText.substring(0, 45)}...`);
      created++;
    }

    console.log(`\nDone! Created: ${created}, Skipped: ${skipped}`);
    console.log('All seasonal questions have weight 0.3 (low impact on matching)');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

seed();
