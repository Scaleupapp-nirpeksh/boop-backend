/**
 * Boop Platform Constants
 */

// 8 Psychological Dimensions
const DIMENSIONS = {
  EMOTIONAL_VULNERABILITY: 'emotional_vulnerability',
  ATTACHMENT_PATTERNS: 'attachment_patterns',
  LIFE_VISION: 'life_vision',
  CONFLICT_RESOLUTION: 'conflict_resolution',
  LOVE_EXPRESSION: 'love_expression',
  INTIMACY_COMFORT: 'intimacy_comfort',
  LIFESTYLE_RHYTHM: 'lifestyle_rhythm',
  GROWTH_MINDSET: 'growth_mindset',
};

// Dimension weights for compatibility scoring
const DIMENSION_WEIGHTS = {
  [DIMENSIONS.EMOTIONAL_VULNERABILITY]: 0.20,
  [DIMENSIONS.ATTACHMENT_PATTERNS]: 0.15,
  [DIMENSIONS.LIFE_VISION]: 0.12,
  [DIMENSIONS.CONFLICT_RESOLUTION]: 0.13,
  [DIMENSIONS.LOVE_EXPRESSION]: 0.10,
  [DIMENSIONS.INTIMACY_COMFORT]: 0.12,
  [DIMENSIONS.LIFESTYLE_RHYTHM]: 0.08,
  [DIMENSIONS.GROWTH_MINDSET]: 0.10,
};

// Connection stages state machine
const CONNECTION_STAGES = {
  DISCOVERED: 'discovered',
  LIKED: 'liked',
  MUTUAL: 'mutual',
  CONNECTING: 'connecting',
  REVEAL_READY: 'reveal_ready',
  REVEALED: 'revealed',
  DATING: 'dating',
  ARCHIVED: 'archived',
};

// Valid stage transitions
const STAGE_TRANSITIONS = {
  [CONNECTION_STAGES.DISCOVERED]: [CONNECTION_STAGES.LIKED, CONNECTION_STAGES.ARCHIVED],
  [CONNECTION_STAGES.LIKED]: [CONNECTION_STAGES.MUTUAL, CONNECTION_STAGES.ARCHIVED],
  [CONNECTION_STAGES.MUTUAL]: [CONNECTION_STAGES.CONNECTING],
  [CONNECTION_STAGES.CONNECTING]: [CONNECTION_STAGES.REVEAL_READY, CONNECTION_STAGES.ARCHIVED],
  [CONNECTION_STAGES.REVEAL_READY]: [CONNECTION_STAGES.REVEALED, CONNECTION_STAGES.CONNECTING],
  [CONNECTION_STAGES.REVEALED]: [CONNECTION_STAGES.DATING, CONNECTION_STAGES.ARCHIVED],
  [CONNECTION_STAGES.DATING]: [CONNECTION_STAGES.ARCHIVED],
  [CONNECTION_STAGES.ARCHIVED]: [],
};

// Profile completion stages
const PROFILE_STAGES = {
  INCOMPLETE: 'incomplete',
  VOICE_PENDING: 'voice_pending',
  QUESTIONS_PENDING: 'questions_pending',
  READY: 'ready',
};

// Comfort score factors and weights
const COMFORT_WEIGHTS = {
  MESSAGE_VOLUME: 0.15,
  MESSAGE_DEPTH: 0.20,
  VOICE_ENGAGEMENT: 0.15,
  GAMES_COMPLETED: 0.15,
  RESPONSE_CONSISTENCY: 0.10,
  ACTIVE_DAYS: 0.15,
  VULNERABILITY_SIGNALS: 0.10,
};

// Comfort threshold for photo reveal
const COMFORT_REVEAL_THRESHOLD = 70;

// Date readiness weights
const DATE_READINESS_WEIGHTS = {
  COMPATIBILITY: 0.35,
  ENGAGEMENT: 0.20,
  RED_FLAGS: 0.25,
  MUTUAL_INTEREST: 0.20,
};

// Question depth levels
const DEPTH_LEVELS = {
  SURFACE: 'surface',
  MODERATE: 'moderate',
  DEEP: 'deep',
  VULNERABLE: 'vulnerable',
};

// Psychological frameworks
const PSYCH_FRAMEWORKS = {
  ATTACHMENT_THEORY: 'attachment_theory',
  BIG_FIVE: 'big_five',
  LOVE_LANGUAGES: 'love_languages',
  CONFLICT_STYLES: 'conflict_styles',
  EMOTIONAL_INTELLIGENCE: 'emotional_intelligence',
  VALUES_HIERARCHY: 'values_hierarchy',
  GROWTH_MINDSET: 'growth_mindset',
};

// Attachment styles
const ATTACHMENT_STYLES = [
  'secure',
  'anxious',
  'avoidant',
  'fearful-avoidant',
  'earned-secure',
  'unknown',
];

// Love languages
const LOVE_LANGUAGES = [
  'words_of_affirmation',
  'quality_time',
  'receiving_gifts',
  'acts_of_service',
  'physical_touch',
];

// Allowed reaction emojis
const REACTION_EMOJIS = ['❤️', '😊', '😂', '😍', '👍', '🔥', '😮', '😢'];

// Game types
const GAME_TYPES = {
  WOULD_YOU_RATHER: 'would_you_rather',
  INTIMACY_SPECTRUM: 'intimacy_spectrum',
  NEVER_HAVE_I_EVER: 'never_have_i_ever',
  WHAT_WOULD_YOU_DO: 'what_would_you_do',
  DREAM_BOARD: 'dream_board',
  TWO_TRUTHS_A_LIE: 'two_truths_a_lie',
  BLIND_REVEAL: 'blind_reveal',
};

// Match tiers
const MATCH_TIERS = {
  PLATINUM: { min: 85, max: 100, label: 'Exceptional Match' },
  GOLD: { min: 75, max: 84, label: 'Strong Match' },
  SILVER: { min: 65, max: 74, label: 'Good Match' },
  BRONZE: { min: 55, max: 64, label: 'Worth Exploring' },
};

module.exports = {
  DIMENSIONS,
  DIMENSION_WEIGHTS,
  CONNECTION_STAGES,
  STAGE_TRANSITIONS,
  PROFILE_STAGES,
  COMFORT_WEIGHTS,
  COMFORT_REVEAL_THRESHOLD,
  DATE_READINESS_WEIGHTS,
  DEPTH_LEVELS,
  PSYCH_FRAMEWORKS,
  ATTACHMENT_STYLES,
  LOVE_LANGUAGES,
  REACTION_EMOJIS,
  GAME_TYPES,
  MATCH_TIERS,
};
