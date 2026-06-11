// MARK: - Personality Archetype Catalog
//
// A FIXED catalog of 14 personality archetypes. The AI classifies each user
// into EXACTLY ONE of these by `code`, so types are numbered, comparable, and
// rare (instead of free-form invented names). Name/essence are resolved from
// this catalog at read time — they are never persisted on the analysis doc.
//
// Each archetype:
//   - code      : stable identifier 'ARCH_01'..'ARCH_14'
//   - number    : 1..14 (display / ordering)
//   - name      : warm two-word type, e.g. "The Gentle Adventurer"
//   - essence   : one-line poetic read of who they are
//   - signature : one-line trait profile that maps here; fed to GPT-4o to
//                 guide classification. Kept genuinely distinct across the set
//                 (emotional openness, attachment, adventurousness, depth,
//                 pace, social energy, etc.) so the model can pick sensibly.

const ARCHETYPES = [
  {
    code: 'ARCH_01',
    number: 1,
    name: 'The Gentle Adventurer',
    essence: 'Soft-hearted and curious, they wander toward connection without ever losing their kindness.',
    signature:
      'Emotionally open and warm, moderately adventurous, secure attachment with a gentle pace — seeks new experiences but never at the cost of tenderness.',
  },
  {
    code: 'ARCH_02',
    number: 2,
    name: 'The Steady Anchor',
    essence: 'Calm, dependable, and grounding — the safe harbor others drift home to.',
    signature:
      'Low novelty-seeking, high stability and loyalty, steady emotional regulation and a slow deliberate pace — values consistency and security over excitement.',
  },
  {
    code: 'ARCH_03',
    number: 3,
    name: 'The Bright Catalyst',
    essence: 'High-energy and magnetic, they spark momentum and light up every room they enter.',
    signature:
      'Very high social energy and extraversion, fast pace, expressive and initiating — drives change and brings people together, thrives on stimulation.',
  },
  {
    code: 'ARCH_04',
    number: 4,
    name: 'The Quiet Deep',
    essence: 'Introspective and still, they hold oceans of feeling beneath a calm surface.',
    signature:
      'Introverted and reflective, very high emotional depth and inner life, slow to open but profoundly loyal once trust is earned — prefers few deep bonds over many shallow ones.',
  },
  {
    code: 'ARCH_05',
    number: 5,
    name: 'The Open Romantic',
    essence: 'Wears their heart wide open, believing love is the truest adventure of all.',
    signature:
      'Extremely high emotional openness and affection, expressive love language, optimistic and quick to attach — leads with vulnerability and seeks deep romantic intimacy.',
  },
  {
    code: 'ARCH_06',
    number: 6,
    name: 'The Free Spirit',
    essence: 'Unbound and spontaneous, they chase freedom and follow their own wind.',
    signature:
      'Very high adventurousness and independence, low need for routine, spontaneous and autonomy-valuing — resists constraint and prizes personal freedom in relationships.',
  },
  {
    code: 'ARCH_07',
    number: 7,
    name: 'The Devoted Builder',
    essence: 'Patient and committed, they construct love brick by brick into something lasting.',
    signature:
      'High commitment and conscientiousness, future-oriented and practical, steady pace with deep loyalty — builds long-term partnership through reliability and effort.',
  },
  {
    code: 'ARCH_08',
    number: 8,
    name: 'The Playful Sage',
    essence: 'Wise but never heavy, they carry deep insight with a light, laughing touch.',
    signature:
      'High openness and humor balanced with reflection, moderate social energy, playful yet emotionally intelligent — disarms with wit while reading people deeply.',
  },
  {
    code: 'ARCH_09',
    number: 9,
    name: 'The Tender Realist',
    essence: 'Warm yet clear-eyed, they love deeply while keeping both feet on the ground.',
    signature:
      'Balanced emotional openness with high pragmatism, grounded expectations, measured pace — affectionate but level-headed, values honesty over fantasy.',
  },
  {
    code: 'ARCH_10',
    number: 10,
    name: 'The Bold Dreamer',
    essence: 'Visionary and fearless, they reach for the impossible and pull love along for the ride.',
    signature:
      'Very high openness and ambition, future-facing and idealistic, high energy with bold risk tolerance — driven by big dreams and seeks a partner to dream alongside.',
  },
  {
    code: 'ARCH_11',
    number: 11,
    name: 'The Warm Strategist',
    essence: 'Thoughtful and intentional, they pair a caring heart with a deliberate mind.',
    signature:
      'High conscientiousness and analytical thinking paired with genuine warmth, measured pace, plans intentionally — approaches relationships thoughtfully and with care.',
  },
  {
    code: 'ARCH_12',
    number: 12,
    name: 'The Curious Wanderer',
    essence: 'Endlessly questioning, they explore ideas and people with bright, open wonder.',
    signature:
      'Very high curiosity and openness to experience, intellectually adventurous, moderate attachment — drawn to novelty of mind and conversation, explores before committing.',
  },
  {
    code: 'ARCH_13',
    number: 13,
    name: 'The Loyal Flame',
    essence: 'Fiercely devoted and passionate, they burn steady and bright for the ones they love.',
    signature:
      'High passion and intensity combined with very high loyalty, deep attachment, emotionally expressive — fiercely committed and protective once bonded.',
  },
  {
    code: 'ARCH_14',
    number: 14,
    name: 'The Soft Rebel',
    essence: 'Gently defiant, they honor their own truth while keeping their heart kind.',
    signature:
      'Independent and unconventional with high emotional warmth, questions norms gently, values authenticity — resists expectation but leads with compassion rather than edge.',
  },
];

const ARCHETYPE_CODES = ARCHETYPES.map((a) => a.code);

/**
 * Look up an archetype by its code.
 * @param {string} code - e.g. 'ARCH_01'
 * @returns {{code: string, number: number, name: string, essence: string, signature: string}|null}
 */
function findByCode(code) {
  if (!code) return null;
  return ARCHETYPES.find((a) => a.code === code) || null;
}

module.exports = { ARCHETYPES, ARCHETYPE_CODES, findByCode };
