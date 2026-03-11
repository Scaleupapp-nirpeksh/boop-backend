/**
 * Seed Script — 60 Psychological Questions for Boop
 *
 * Distribution:
 *   Day 1:    Questions 1–15  (surface + moderate, ~2 per dimension)
 *   Days 2–4: Questions 16–30 (moderate)
 *   Days 5–6: Questions 31–45 (deep)
 *   Days 7–10: Questions 46–60 (deep + vulnerable)
 *
 * Run: node src/scripts/seedQuestions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('../models/Question');

const questions = [
  // ═══════════════════════════════════════════════════════════════════════
  // DAY 1 — Questions 1–15 (Surface + Moderate)
  // ═══════════════════════════════════════════════════════════════════════

  // Emotional Vulnerability (2)
  {
    questionNumber: 1,
    dimension: 'emotional_vulnerability',
    depthLevel: 'surface',
    questionText: 'When something really excites you, who do you call first?',
    questionType: 'text',
    characterLimit: 300,
    dayAvailable: 1,
    order: 1,
    weight: 1.0,
    analysisPrompt: 'Assess emotional openness and who they trust with positive emotions.',
  },
  {
    questionNumber: 2,
    dimension: 'emotional_vulnerability',
    depthLevel: 'surface',
    questionText: 'How do you usually process a bad day?',
    questionType: 'single_choice',
    options: [
      'I talk it out with someone close',
      'I need alone time to decompress',
      'I distract myself with activities',
      'I journal or reflect quietly',
    ],
    dayAvailable: 1,
    order: 2,
    weight: 1.0,
    analysisPrompt: 'Identify emotional processing style — externalizer vs internalizer.',
  },

  // Attachment Patterns (2)
  {
    questionNumber: 3,
    dimension: 'attachment_patterns',
    depthLevel: 'surface',
    questionText: 'In your closest friendships, would you say you reach out first or wait to be reached out to?',
    questionType: 'single_choice',
    options: [
      'I usually reach out first',
      'It\'s pretty balanced',
      'I tend to wait for them',
      'It depends on my mood',
    ],
    dayAvailable: 1,
    order: 3,
    weight: 1.0,
    analysisPrompt: 'Assess pursuit vs withdrawal tendencies in close relationships.',
  },
  {
    questionNumber: 4,
    dimension: 'attachment_patterns',
    depthLevel: 'moderate',
    questionText: 'How do you feel when someone you care about doesn\'t text back for a while?',
    questionType: 'text',
    characterLimit: 300,
    dayAvailable: 1,
    order: 4,
    weight: 1.2,
    analysisPrompt: 'Evaluate anxious vs secure attachment responses to uncertainty.',
  },

  // Life Vision (2)
  {
    questionNumber: 5,
    dimension: 'life_vision',
    depthLevel: 'surface',
    questionText: 'Where do you see yourself living in 5 years?',
    questionType: 'single_choice',
    options: [
      'Same city — I love my roots',
      'A new city — adventure awaits',
      'Wherever life takes me',
      'Abroad — the world is my home',
    ],
    dayAvailable: 1,
    order: 5,
    weight: 1.0,
    analysisPrompt: 'Gauge stability vs exploration orientation for life vision compatibility.',
  },
  {
    questionNumber: 6,
    dimension: 'life_vision',
    depthLevel: 'surface',
    questionText: 'What does a perfect Sunday look like for you?',
    questionType: 'text',
    characterLimit: 300,
    dayAvailable: 1,
    order: 6,
    weight: 0.8,
    analysisPrompt: 'Understand daily lifestyle preferences and energy patterns.',
  },

  // Conflict Resolution (2)
  {
    questionNumber: 7,
    dimension: 'conflict_resolution',
    depthLevel: 'surface',
    questionText: 'When you disagree with a friend, what\'s your first instinct?',
    questionType: 'single_choice',
    options: [
      'Address it directly and talk it through',
      'Give it some time before bringing it up',
      'Let it go unless it\'s really important',
      'Try to find a compromise right away',
    ],
    dayAvailable: 1,
    order: 7,
    weight: 1.0,
    analysisPrompt: 'Identify conflict approach style — confronting, avoiding, or compromising.',
  },
  {
    questionNumber: 8,
    dimension: 'conflict_resolution',
    depthLevel: 'moderate',
    questionText: 'What\'s one thing people misunderstand about you during arguments?',
    questionType: 'text',
    characterLimit: 300,
    dayAvailable: 1,
    order: 8,
    weight: 1.2,
    analysisPrompt: 'Reveal self-awareness about conflict behavior and communication gaps.',
  },

  // Love Expression (2)
  {
    questionNumber: 9,
    dimension: 'love_expression',
    depthLevel: 'surface',
    questionText: 'How do you most naturally show someone you care?',
    questionType: 'single_choice',
    options: [
      'Words — I tell them how I feel',
      'Quality time — I make time for them',
      'Acts of service — I do things for them',
      'Physical affection — hugs, touch, closeness',
      'Gifts — thoughtful surprises',
    ],
    dayAvailable: 1,
    order: 9,
    weight: 1.0,
    analysisPrompt: 'Map primary love language for expression.',
  },
  {
    questionNumber: 10,
    dimension: 'love_expression',
    depthLevel: 'surface',
    questionText: 'What makes you feel most appreciated by someone?',
    questionType: 'text',
    characterLimit: 300,
    dayAvailable: 1,
    order: 10,
    weight: 1.0,
    analysisPrompt: 'Map receptive love language — what they need to feel loved.',
  },

  // Intimacy Comfort (2)
  {
    questionNumber: 11,
    dimension: 'intimacy_comfort',
    depthLevel: 'surface',
    questionText: 'How comfortable are you sharing personal stories with someone new?',
    questionType: 'single_choice',
    options: [
      'Very comfortable — I\'m an open book',
      'Somewhat — I open up gradually',
      'Cautious — trust needs to be earned',
      'It really depends on the vibe',
    ],
    dayAvailable: 1,
    order: 11,
    weight: 1.0,
    analysisPrompt: 'Gauge openness gradient and trust-building pace.',
  },
  {
    questionNumber: 12,
    dimension: 'intimacy_comfort',
    depthLevel: 'moderate',
    questionText: 'What\'s a topic you rarely discuss with people you\'re dating?',
    questionType: 'text',
    characterLimit: 300,
    dayAvailable: 1,
    order: 12,
    weight: 1.2,
    analysisPrompt: 'Identify emotional boundaries and intimacy comfort limits.',
  },

  // Lifestyle Rhythm (1)
  {
    questionNumber: 13,
    dimension: 'lifestyle_rhythm',
    depthLevel: 'surface',
    questionText: 'Are you more of a planner or a go-with-the-flow person?',
    questionType: 'single_choice',
    options: [
      'Hardcore planner — I need structure',
      'Mostly planned with room for spontaneity',
      'Go with the flow — plans stress me out',
      'Depends on the situation',
    ],
    dayAvailable: 1,
    order: 13,
    weight: 0.8,
    analysisPrompt: 'Assess structure vs spontaneity preference for lifestyle compatibility.',
  },

  // Growth Mindset (2)
  {
    questionNumber: 14,
    dimension: 'growth_mindset',
    depthLevel: 'surface',
    questionText: 'What\'s the most recent thing you taught yourself?',
    questionType: 'text',
    characterLimit: 300,
    dayAvailable: 1,
    order: 14,
    weight: 0.8,
    analysisPrompt: 'Evaluate curiosity, self-improvement drive, and learning orientation.',
  },
  {
    questionNumber: 15,
    dimension: 'growth_mindset',
    depthLevel: 'moderate',
    questionText: 'When you fail at something, how long does it take you to try again?',
    questionType: 'single_choice',
    options: [
      'Almost immediately — failure motivates me',
      'A few days to regroup',
      'I need significant time to recover',
      'Honestly, I sometimes don\'t try again',
    ],
    dayAvailable: 1,
    order: 15,
    weight: 1.0,
    analysisPrompt: 'Assess resilience and growth mindset vs fixed mindset indicators.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DAYS 2–4 — Questions 16–30 (Moderate)
  // ═══════════════════════════════════════════════════════════════════════

  {
    questionNumber: 16,
    dimension: 'emotional_vulnerability',
    depthLevel: 'moderate',
    questionText: 'What emotion do you find hardest to express to someone you\'re dating?',
    questionType: 'single_choice',
    options: [
      'Sadness — I don\'t want to seem weak',
      'Anger — I worry about overreacting',
      'Love — it feels too vulnerable',
      'Fear — I don\'t like showing uncertainty',
      'Jealousy — it feels embarrassing',
    ],
    dayAvailable: 2,
    order: 1,
    weight: 1.5,
    analysisPrompt: 'Identify emotional suppression patterns and vulnerability barriers.',
  },
  {
    questionNumber: 17,
    dimension: 'attachment_patterns',
    depthLevel: 'moderate',
    questionText: 'When a new relationship is going really well, what\'s the first worry that pops up?',
    questionType: 'text',
    characterLimit: 400,
    dayAvailable: 2,
    order: 2,
    weight: 1.5,
    analysisPrompt: 'Reveal attachment-related anxieties — fear of abandonment, engulfment, or loss.',
  },
  {
    questionNumber: 18,
    dimension: 'life_vision',
    depthLevel: 'moderate',
    questionText: 'How important is career ambition in a partner to you?',
    questionType: 'single_choice',
    options: [
      'Very important — drive is attractive',
      'Somewhat — as long as they\'re passionate about something',
      'Not very — I value presence over ambition',
      'Doesn\'t matter as long as we\'re happy',
    ],
    dayAvailable: 2,
    order: 3,
    weight: 1.0,
    analysisPrompt: 'Map values around achievement, ambition, and partner expectations.',
  },
  {
    questionNumber: 19,
    dimension: 'conflict_resolution',
    depthLevel: 'moderate',
    questionText: 'After a heated argument, what do you need most to feel better?',
    questionType: 'single_choice',
    options: [
      'A sincere apology',
      'Space and time to cool down',
      'A conversation about what happened',
      'Physical reassurance — a hug or closeness',
      'An acknowledgment that my feelings are valid',
    ],
    dayAvailable: 2,
    order: 4,
    weight: 1.2,
    analysisPrompt: 'Identify post-conflict repair mechanism preference.',
  },
  {
    questionNumber: 20,
    dimension: 'love_expression',
    depthLevel: 'moderate',
    questionText: 'Describe the most thoughtful gesture someone has done for you.',
    questionType: 'text',
    characterLimit: 400,
    dayAvailable: 2,
    order: 5,
    weight: 1.2,
    analysisPrompt: 'Understand what meaningful love expression looks like to them.',
  },
  {
    questionNumber: 21,
    dimension: 'intimacy_comfort',
    depthLevel: 'moderate',
    questionText: 'What pace of emotional intimacy feels right to you in a new relationship?',
    questionType: 'single_choice',
    options: [
      'Fast — I dive in deep quickly',
      'Moderate — a few weeks of getting to know each other',
      'Slow — months of building trust first',
      'It depends entirely on the connection',
    ],
    dayAvailable: 3,
    order: 1,
    weight: 1.2,
    analysisPrompt: 'Map intimacy pacing preference for compatibility matching.',
  },
  {
    questionNumber: 22,
    dimension: 'lifestyle_rhythm',
    depthLevel: 'moderate',
    questionText: 'How do you feel about spending time apart in a relationship?',
    questionType: 'single_choice',
    options: [
      'I need significant alone time',
      'Some space is healthy and important',
      'I prefer being together most of the time',
      'I\'m flexible — depends on the relationship',
    ],
    dayAvailable: 3,
    order: 2,
    weight: 1.0,
    analysisPrompt: 'Assess independence vs togetherness needs for lifestyle compatibility.',
  },
  {
    questionNumber: 23,
    dimension: 'growth_mindset',
    depthLevel: 'moderate',
    questionText: 'What\'s a belief you held strongly 2 years ago that you\'ve since changed?',
    questionType: 'text',
    characterLimit: 400,
    dayAvailable: 3,
    order: 3,
    weight: 1.2,
    analysisPrompt: 'Evaluate cognitive flexibility and openness to personal evolution.',
  },
  {
    questionNumber: 24,
    dimension: 'emotional_vulnerability',
    depthLevel: 'moderate',
    questionText: 'How do you react when someone cries in front of you?',
    questionType: 'single_choice',
    options: [
      'I comfort them physically — hold them',
      'I listen and validate their feelings',
      'I try to help solve the problem',
      'I feel uncomfortable but try my best',
      'I give them space if they need it',
    ],
    dayAvailable: 3,
    order: 4,
    weight: 1.2,
    analysisPrompt: 'Assess emotional responsiveness and comfort with others\' vulnerability.',
  },
  {
    questionNumber: 25,
    dimension: 'attachment_patterns',
    depthLevel: 'moderate',
    questionText: 'In past relationships, have you been the one to hold on or the one to let go?',
    questionType: 'single_choice',
    options: [
      'I tend to hold on — sometimes too long',
      'I let go when it\'s clearly not working',
      'It\'s been a mix of both',
      'I usually end things before getting too attached',
    ],
    dayAvailable: 4,
    order: 1,
    weight: 1.5,
    analysisPrompt: 'Map attachment tendency — anxious pursuit vs avoidant withdrawal.',
  },
  {
    questionNumber: 26,
    dimension: 'conflict_resolution',
    depthLevel: 'moderate',
    questionText: 'Do you think it\'s better to "never go to bed angry" or "sleep on it"?',
    questionType: 'single_choice',
    options: [
      'Never go to bed angry — resolve it now',
      'Sleep on it — cooler heads prevail',
      'Depends on how serious the issue is',
    ],
    followUpQuestion: 'Why does that approach work for you?',
    dayAvailable: 4,
    order: 2,
    weight: 1.0,
    analysisPrompt: 'Identify conflict timing preferences and rationale.',
  },
  {
    questionNumber: 27,
    dimension: 'love_expression',
    depthLevel: 'moderate',
    questionText: 'What small, everyday thing would make you feel most loved in a relationship?',
    questionType: 'text',
    characterLimit: 300,
    dayAvailable: 4,
    order: 3,
    weight: 1.2,
    analysisPrompt: 'Identify micro-expressions of love that matter most for daily compatibility.',
  },
  {
    questionNumber: 28,
    dimension: 'life_vision',
    depthLevel: 'moderate',
    questionText: 'What role does family play in your life right now?',
    questionType: 'text',
    characterLimit: 400,
    dayAvailable: 4,
    order: 4,
    weight: 1.2,
    analysisPrompt: 'Understand family attachment and its influence on relationship expectations.',
  },
  {
    questionNumber: 29,
    dimension: 'intimacy_comfort',
    depthLevel: 'moderate',
    questionText: 'Would you rather have deep conversations or comfortable silence with your partner?',
    questionType: 'single_choice',
    options: [
      'Deep conversations — always',
      'Comfortable silence — it\'s underrated',
      'A healthy mix of both',
      'Depends on my mood',
    ],
    dayAvailable: 4,
    order: 5,
    weight: 1.0,
    analysisPrompt: 'Gauge communication style preference and comfort with emotional closeness.',
  },
  {
    questionNumber: 30,
    dimension: 'lifestyle_rhythm',
    depthLevel: 'moderate',
    questionText: 'What\'s your relationship with social media?',
    questionType: 'single_choice',
    options: [
      'I post regularly — it\'s part of my life',
      'I scroll but rarely post',
      'I\'m barely on it',
      'I actively avoid it',
    ],
    dayAvailable: 4,
    order: 6,
    weight: 0.8,
    analysisPrompt: 'Assess digital lifestyle compatibility and public vs private personality.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DAYS 5–6 — Questions 31–45 (Deep)
  // ═══════════════════════════════════════════════════════════════════════

  {
    questionNumber: 31,
    dimension: 'emotional_vulnerability',
    depthLevel: 'deep',
    questionText: 'What\'s the hardest thing you\'ve had to forgive someone for?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 5,
    order: 1,
    weight: 1.8,
    analysisPrompt: 'Assess depth of emotional processing, forgiveness capacity, and past wounds.',
  },
  {
    questionNumber: 32,
    dimension: 'attachment_patterns',
    depthLevel: 'deep',
    questionText: 'What does "feeling safe" in a relationship actually look like for you?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 5,
    order: 2,
    weight: 2.0,
    analysisPrompt: 'Reveal core attachment needs and safety requirements in intimacy.',
  },
  {
    questionNumber: 33,
    dimension: 'life_vision',
    depthLevel: 'deep',
    questionText: 'If money and obligations weren\'t a factor, what would your life look like?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 5,
    order: 3,
    weight: 1.5,
    analysisPrompt: 'Uncover authentic life aspirations stripped of practical constraints.',
  },
  {
    questionNumber: 34,
    dimension: 'conflict_resolution',
    depthLevel: 'deep',
    questionText: 'What pattern in your past relationships do you most want to break?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 5,
    order: 4,
    weight: 2.0,
    analysisPrompt: 'Identify self-awareness about relationship patterns and desire for growth.',
  },
  {
    questionNumber: 35,
    dimension: 'love_expression',
    depthLevel: 'deep',
    questionText: 'When was the last time you felt truly, deeply loved? What made it feel that way?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 5,
    order: 5,
    weight: 1.8,
    analysisPrompt: 'Map peak love experience to understand deepest relational needs.',
  },
  {
    questionNumber: 36,
    dimension: 'intimacy_comfort',
    depthLevel: 'deep',
    questionText: 'What\'s a part of yourself you keep hidden until you really trust someone?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 5,
    order: 6,
    weight: 2.0,
    analysisPrompt: 'Identify hidden layers and the trust threshold for deep intimacy.',
  },
  {
    questionNumber: 37,
    dimension: 'growth_mindset',
    depthLevel: 'deep',
    questionText: 'What\'s the most painful lesson you\'ve learned that you\'re now grateful for?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 5,
    order: 7,
    weight: 1.8,
    analysisPrompt: 'Assess post-traumatic growth and ability to derive meaning from pain.',
  },
  {
    questionNumber: 38,
    dimension: 'emotional_vulnerability',
    depthLevel: 'deep',
    questionText: 'How do you know when you\'re falling for someone? What does it feel like in your body?',
    questionType: 'text',
    characterLimit: 400,
    dayAvailable: 6,
    order: 1,
    weight: 1.8,
    analysisPrompt: 'Gauge somatic awareness of emotions and vulnerability in romantic contexts.',
  },
  {
    questionNumber: 39,
    dimension: 'attachment_patterns',
    depthLevel: 'deep',
    questionText: 'What would your ex say is the reason things didn\'t work out?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 6,
    order: 2,
    weight: 2.0,
    analysisPrompt: 'Assess self-reflection, accountability, and attachment pattern awareness.',
  },
  {
    questionNumber: 40,
    dimension: 'life_vision',
    depthLevel: 'deep',
    questionText: 'Do you want children someday? What kind of parent do you imagine being?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 6,
    order: 3,
    weight: 2.0,
    analysisPrompt: 'Critical dealbreaker question — map family planning alignment.',
  },
  {
    questionNumber: 41,
    dimension: 'conflict_resolution',
    depthLevel: 'deep',
    questionText: 'What\'s something you\'d want a partner to know about how NOT to approach conflict with you?',
    questionType: 'text',
    characterLimit: 400,
    dayAvailable: 6,
    order: 4,
    weight: 1.8,
    analysisPrompt: 'Identify conflict triggers and communication needs during disagreement.',
  },
  {
    questionNumber: 42,
    dimension: 'love_expression',
    depthLevel: 'deep',
    questionText: 'How were emotions handled in the home you grew up in?',
    questionType: 'single_choice',
    options: [
      'Openly expressed and discussed',
      'Expressed but rarely discussed',
      'Mostly suppressed or avoided',
      'It depended on the emotion',
    ],
    followUpQuestion: 'How has that shaped how you love now?',
    dayAvailable: 6,
    order: 5,
    weight: 2.0,
    analysisPrompt: 'Map family-of-origin emotional patterns and their influence on current love style.',
  },
  {
    questionNumber: 43,
    dimension: 'intimacy_comfort',
    depthLevel: 'deep',
    questionText: 'What does emotional intimacy mean to you, and how is it different from physical intimacy?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 6,
    order: 6,
    weight: 1.8,
    analysisPrompt: 'Understand their framework for intimacy and connection hierarchy.',
  },
  {
    questionNumber: 44,
    dimension: 'lifestyle_rhythm',
    depthLevel: 'deep',
    questionText: 'What does your ideal balance between work, relationships, and personal time look like?',
    questionType: 'text',
    characterLimit: 400,
    dayAvailable: 6,
    order: 7,
    weight: 1.2,
    analysisPrompt: 'Map energy distribution and priority alignment for lifestyle compatibility.',
  },
  {
    questionNumber: 45,
    dimension: 'growth_mindset',
    depthLevel: 'deep',
    questionText: 'What part of yourself are you currently working on improving?',
    questionType: 'text',
    characterLimit: 400,
    dayAvailable: 6,
    order: 8,
    weight: 1.5,
    analysisPrompt: 'Assess active self-improvement orientation and self-awareness.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DAYS 7–10 — Questions 46–60 (Deep + Vulnerable)
  // ═══════════════════════════════════════════════════════════════════════

  {
    questionNumber: 46,
    dimension: 'emotional_vulnerability',
    depthLevel: 'vulnerable',
    questionText: 'What\'s your biggest fear about falling in love?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 7,
    order: 1,
    weight: 2.5,
    analysisPrompt: 'Core vulnerability — identify deepest romantic fears for attachment mapping.',
  },
  {
    questionNumber: 47,
    dimension: 'attachment_patterns',
    depthLevel: 'vulnerable',
    questionText: 'Have you ever pushed someone away because they got too close? What happened?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 7,
    order: 2,
    weight: 2.5,
    analysisPrompt: 'Identify avoidant attachment behaviors and self-awareness about them.',
  },
  {
    questionNumber: 48,
    dimension: 'conflict_resolution',
    depthLevel: 'vulnerable',
    questionText: 'What\'s the most important apology you\'ve ever given or received?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 7,
    order: 3,
    weight: 2.0,
    analysisPrompt: 'Assess capacity for repair, humility, and accountability in relationships.',
  },
  {
    questionNumber: 49,
    dimension: 'love_expression',
    depthLevel: 'vulnerable',
    questionText: 'What does love look like when it\'s at its most honest and imperfect?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 7,
    order: 4,
    weight: 2.5,
    analysisPrompt: 'Reveal authentic love ideals beyond fairy-tale narratives.',
  },
  {
    questionNumber: 50,
    dimension: 'intimacy_comfort',
    depthLevel: 'vulnerable',
    questionText: 'What would you need from a partner to feel safe enough to be completely yourself?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 8,
    order: 1,
    weight: 2.5,
    analysisPrompt: 'Map safety requirements for authentic self-expression in relationships.',
  },
  {
    questionNumber: 51,
    dimension: 'growth_mindset',
    depthLevel: 'vulnerable',
    questionText: 'What\'s something you\'re still healing from?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 8,
    order: 2,
    weight: 2.5,
    analysisPrompt: 'Identify active wounds and emotional availability for new relationships.',
  },
  {
    questionNumber: 52,
    dimension: 'emotional_vulnerability',
    depthLevel: 'vulnerable',
    questionText: 'When was the last time you cried? What brought it on?',
    questionType: 'text',
    characterLimit: 400,
    dayAvailable: 8,
    order: 3,
    weight: 2.0,
    analysisPrompt: 'Gauge emotional expressiveness and comfort with tears/vulnerability.',
  },
  {
    questionNumber: 53,
    dimension: 'attachment_patterns',
    depthLevel: 'vulnerable',
    questionText: 'What did love look like in your parents\' relationship, and how has that affected your own?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 8,
    order: 4,
    weight: 2.5,
    analysisPrompt: 'Map intergenerational attachment patterns and family-of-origin influences.',
  },
  {
    questionNumber: 54,
    dimension: 'life_vision',
    depthLevel: 'vulnerable',
    questionText: 'What would you regret not having experienced or said if your life ended tomorrow?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 9,
    order: 1,
    weight: 2.5,
    analysisPrompt: 'Identify deepest life values and unfulfilled needs for compatibility.',
  },
  {
    questionNumber: 55,
    dimension: 'conflict_resolution',
    depthLevel: 'vulnerable',
    questionText: 'What\'s a fight you had with someone you love that actually made the relationship stronger?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 9,
    order: 2,
    weight: 2.0,
    analysisPrompt: 'Assess ability to use conflict as growth catalyst in relationships.',
  },
  {
    questionNumber: 56,
    dimension: 'love_expression',
    depthLevel: 'vulnerable',
    questionText: 'If you could hear one thing from your future partner right now, what would it be?',
    questionType: 'text',
    characterLimit: 300,
    dayAvailable: 9,
    order: 3,
    weight: 2.5,
    analysisPrompt: 'Reveal deepest unmet emotional needs and love aspirations.',
  },
  {
    questionNumber: 57,
    dimension: 'intimacy_comfort',
    depthLevel: 'vulnerable',
    questionText: 'Have you ever been truly seen by someone — like they understood you in a way nobody else does? What was that like?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 9,
    order: 4,
    weight: 2.5,
    analysisPrompt: 'Assess experience with deep emotional connection and its impact.',
  },
  {
    questionNumber: 58,
    dimension: 'lifestyle_rhythm',
    depthLevel: 'deep',
    questionText: 'What non-negotiables do you have for a relationship?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 10,
    order: 1,
    weight: 2.5,
    analysisPrompt: 'Identify dealbreakers and core requirements for relationship compatibility.',
  },
  {
    questionNumber: 59,
    dimension: 'growth_mindset',
    depthLevel: 'vulnerable',
    questionText: 'What would you want your partner to know about you that you\'d normally take months to share?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 10,
    order: 2,
    weight: 3.0,
    analysisPrompt: 'Ultimate vulnerability question — reveals what they most want to be known for.',
  },
  {
    questionNumber: 60,
    dimension: 'emotional_vulnerability',
    depthLevel: 'vulnerable',
    questionText: 'Write a letter to your future partner. What do you want them to know about the journey that led you here?',
    questionType: 'text',
    characterLimit: 500,
    dayAvailable: 10,
    order: 3,
    weight: 3.0,
    analysisPrompt: 'Capstone vulnerability question — synthesizes emotional depth, self-awareness, and hope.',
  },
];

// ─── Seed Runner ────────────────────────────────────────────────────────

async function seed() {
  try {
    console.log('🌱 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing questions
    const deleteResult = await Question.deleteMany({});
    console.log(`🗑️  Cleared ${deleteResult.deletedCount} existing questions`);

    // Insert all questions
    const insertResult = await Question.insertMany(questions);
    console.log(`✅ Seeded ${insertResult.length} questions`);

    // Summary by day
    const daySummary = {};
    questions.forEach((q) => {
      if (!daySummary[q.dayAvailable]) daySummary[q.dayAvailable] = 0;
      daySummary[q.dayAvailable]++;
    });

    console.log('\n📊 Distribution:');
    Object.entries(daySummary)
      .sort(([a], [b]) => a - b)
      .forEach(([day, count]) => {
        console.log(`   Day ${day}: ${count} questions`);
      });

    // Summary by dimension
    const dimSummary = {};
    questions.forEach((q) => {
      if (!dimSummary[q.dimension]) dimSummary[q.dimension] = 0;
      dimSummary[q.dimension]++;
    });

    console.log('\n🧠 Dimensions:');
    Object.entries(dimSummary)
      .sort(([, a], [, b]) => b - a)
      .forEach(([dim, count]) => {
        console.log(`   ${dim}: ${count} questions`);
      });

    console.log('\n🎉 Seed complete!');
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

seed();
