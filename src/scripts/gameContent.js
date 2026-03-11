/**
 * Game Content — Prompts and questions for each game type.
 * Used by GameService to populate rounds when creating a game.
 */

// ─── Would You Rather ───────────────────────────────────────────

const WOULD_YOU_RATHER = [
  { optionA: 'Travel the world for a year', optionB: 'Have a year to work on your dream project' },
  { optionA: 'Always know what people are thinking', optionB: 'Always know what people are feeling' },
  { optionA: 'Have deep conversations at dinner', optionB: 'Dance the night away together' },
  { optionA: 'Live in a cozy cabin in the mountains', optionB: 'Live in a beachside apartment' },
  { optionA: 'Be with someone who surprises you constantly', optionB: 'Be with someone who is beautifully predictable' },
  { optionA: 'Never argue but sometimes feel misunderstood', optionB: 'Argue sometimes but always feel heard' },
  { optionA: 'Have a partner who cooks amazingly', optionB: 'Have a partner who plans amazing dates' },
  { optionA: 'Share all passwords with your partner', optionB: 'Keep some personal space sacred' },
  { optionA: 'Know exactly when you will meet your soulmate', optionB: 'Be surprised by love when you least expect it' },
  { optionA: 'Spend a rainy Sunday reading together', optionB: 'Spend a rainy Sunday cooking together' },
  { optionA: 'Have one epic adventure per month', optionB: 'Have peaceful daily rituals together' },
  { optionA: 'Be the funny one in the relationship', optionB: 'Be the grounded one in the relationship' },
  { optionA: 'Get a heartfelt handwritten letter', optionB: 'Get a surprise plane ticket to somewhere new' },
  { optionA: 'Fall in love slowly over years', optionB: 'Fall in love instantly and deeply' },
  { optionA: 'Be completely honest about everything', optionB: 'Sometimes protect feelings with kind omissions' },
  { optionA: 'Grow old in one city together', optionB: 'Move to a new place every few years together' },
  { optionA: 'Have perfect communication but boring routines', optionB: 'Have exciting spontaneity but occasional misunderstandings' },
  { optionA: 'Be rich in experiences', optionB: 'Be rich in comfort and security' },
  { optionA: 'Share all the same hobbies', optionB: 'Have completely different interests that you learn from each other' },
  { optionA: 'Always have someone to talk to', optionB: 'Always have comfortable silence' },
  { optionA: 'Know your partner inside out from day one', optionB: 'Keep discovering new things about them forever' },
  { optionA: 'Have a love that inspires others', optionB: 'Have a love that is private and deeply personal' },
  { optionA: 'Express love through words', optionB: 'Express love through actions' },
  { optionA: 'Go on a digital detox vacation', optionB: 'Document every moment of your trip together' },
  { optionA: 'Have breakfast in bed every morning', optionB: 'Have a midnight snack ritual every night' },
  { optionA: 'Be with someone who challenges you', optionB: 'Be with someone who accepts you exactly as you are' },
  { optionA: 'Have your love story turned into a movie', optionB: 'Keep it as your beautiful secret' },
  { optionA: 'Meet your partner at a bookstore', optionB: 'Meet your partner through a mutual friend' },
  { optionA: 'Relive your first date forever', optionB: 'Skip ahead to the comfortable stage' },
  { optionA: 'Have the ability to freeze time with your partner', optionB: 'Have the ability to time-travel to any memory together' },
];

// ─── Two Truths & A Lie ─────────────────────────────────────────

const TWO_TRUTHS_A_LIE_PROMPTS = [
  'Share two true things and one lie about your childhood',
  'Share two true things and one lie about your travel experiences',
  'Share two true things and one lie about your hidden talents',
  'Share two true things and one lie about your food preferences',
  'Share two true things and one lie about your dreams and aspirations',
  'Share two true things and one lie about your guilty pleasures',
  'Share two true things and one lie about your school/college days',
  'Share two true things and one lie about your first job',
  'Share two true things and one lie about embarrassing moments',
  'Share two true things and one lie about your family traditions',
  'Share two true things and one lie about your fears',
  'Share two true things and one lie about things that make you laugh',
  'Share two true things and one lie about your most spontaneous decisions',
  'Share two true things and one lie about your relationship deal-breakers',
  'Share two true things and one lie about your weekend habits',
];

// ─── Never Have I Ever ──────────────────────────────────────────

const NEVER_HAVE_I_EVER = [
  // Surface (light/fun)
  { text: 'Never have I ever sung karaoke in public', category: 'fun' },
  { text: 'Never have I ever gone on a spontaneous road trip', category: 'adventure' },
  { text: 'Never have I ever eaten an entire pizza by myself', category: 'fun' },
  { text: 'Never have I ever stayed up all night talking to someone', category: 'connection' },
  { text: 'Never have I ever binge-watched an entire series in one day', category: 'fun' },
  { text: 'Never have I ever cooked a meal that was a total disaster', category: 'fun' },
  { text: 'Never have I ever gone to the movies alone', category: 'independence' },
  { text: 'Never have I ever lied about my age', category: 'fun' },
  { text: 'Never have I ever cried watching a movie', category: 'vulnerability' },
  { text: 'Never have I ever danced in the rain', category: 'spontaneity' },
  // Moderate (revealing)
  { text: 'Never have I ever fallen for someone at first sight', category: 'romance' },
  { text: 'Never have I ever kept a journal or diary', category: 'introspection' },
  { text: 'Never have I ever been on a blind date', category: 'dating' },
  { text: 'Never have I ever said "I love you" first', category: 'vulnerability' },
  { text: 'Never have I ever ghosted someone', category: 'dating' },
  { text: 'Never have I ever had a long-distance relationship', category: 'romance' },
  { text: 'Never have I ever written a love letter', category: 'romance' },
  { text: 'Never have I ever pretended to like something to impress a date', category: 'dating' },
  { text: 'Never have I ever been the one to break up', category: 'relationships' },
  { text: 'Never have I ever had a friend become something more', category: 'romance' },
  // Deep (personal)
  { text: 'Never have I ever changed who I am for someone else', category: 'self-discovery' },
  { text: 'Never have I ever forgiven someone who really hurt me', category: 'growth' },
  { text: 'Never have I ever been afraid of being truly known by someone', category: 'vulnerability' },
  { text: 'Never have I ever lost sleep over a relationship decision', category: 'relationships' },
  { text: 'Never have I ever questioned if I was enough for someone', category: 'vulnerability' },
  { text: 'Never have I ever been so comfortable with someone that silence felt like a conversation', category: 'connection' },
  { text: 'Never have I ever made a life-changing decision based on love', category: 'life' },
  { text: 'Never have I ever felt more alone in a relationship than being single', category: 'vulnerability' },
  { text: 'Never have I ever realized my attachment style affects my relationships', category: 'self-discovery' },
  { text: 'Never have I ever opened up to someone about my deepest fear', category: 'vulnerability' },
];

// ─── What Would You Do ─────────────────────────────────────────

const WHAT_WOULD_YOU_DO = [
  { scenario: 'Your partner gets their dream job offer — but it requires moving to another country', context: 'career vs. relationship' },
  { scenario: 'You find out your best friend has been talking behind your partner\'s back', context: 'loyalty conflict' },
  { scenario: 'Your partner wants to spend all of the holidays with their family, leaving none for yours', context: 'boundaries' },
  { scenario: 'You discover your partner has been hiding a large debt from you', context: 'trust & finances' },
  { scenario: 'Your partner\'s ex reaches out wanting to reconnect as friends', context: 'trust & boundaries' },
  { scenario: 'You both get invited to different events on the same night — one matters to you, the other to them', context: 'compromise' },
  { scenario: 'Your partner makes a big decision without consulting you first', context: 'communication' },
  { scenario: 'A stranger flirts with your partner right in front of you', context: 'jealousy & trust' },
  { scenario: 'Your partner wants to adopt a pet, but you\'re not ready for the responsibility', context: 'life decisions' },
  { scenario: 'You notice your partner has been unusually distant and quiet for a week', context: 'emotional awareness' },
  { scenario: 'Your partner criticizes you in front of their friends', context: 'respect & boundaries' },
  { scenario: 'You realize you and your partner have completely different political views', context: 'values alignment' },
  { scenario: 'Your partner forgets a very important date — your anniversary or birthday', context: 'expectations' },
  { scenario: 'Your partner\'s parent openly disapproves of your relationship', context: 'family dynamics' },
  { scenario: 'You catch your partner in a small, harmless lie', context: 'trust fundamentals' },
  { scenario: 'Your partner wants to quit their stable job to pursue a passion project', context: 'risk & support' },
  { scenario: 'You and your partner disagree about whether to have children', context: 'life vision' },
  { scenario: 'Your partner shares something deeply personal and vulnerable with you for the first time', context: 'emotional response' },
  { scenario: 'You feel like you\'re always the one initiating plans and conversations', context: 'effort balance' },
  { scenario: 'Your partner wants to take a solo trip for two weeks', context: 'independence' },
  { scenario: 'You accidentally read a private message on your partner\'s phone', context: 'privacy & honesty' },
  { scenario: 'Your partner\'s friend confides they\'re struggling with depression and asks you not to tell', context: 'moral dilemma' },
  { scenario: 'You find out your partner told their friends details about your private arguments', context: 'privacy' },
  { scenario: 'Your partner suggests couples therapy even though you think things are fine', context: 'self-awareness' },
  { scenario: 'You win a significant amount of money — do you share the decision on how to spend it?', context: 'shared finances' },
  { scenario: 'Your partner wants to reconnect with an estranged family member you think is toxic', context: 'support vs. protection' },
  { scenario: 'You realize your partner\'s love language is completely different from yours', context: 'understanding differences' },
  { scenario: 'Your partner is going through a rough patch at work and taking it out on you', context: 'patience & boundaries' },
  { scenario: 'You both disagree on where to live — city vs. countryside', context: 'lifestyle compromise' },
  { scenario: 'Your partner confesses to something they did years ago that hurt someone', context: 'forgiveness & growth' },
];

// ─── Intimacy Spectrum ─────────────────────────────────────────

const INTIMACY_SPECTRUM = [
  // Emotional
  { text: 'I feel comfortable sharing my deepest insecurities with a partner', category: 'emotional' },
  { text: 'I need verbal reassurance to feel loved', category: 'emotional' },
  { text: 'I find it easy to cry in front of someone I trust', category: 'emotional' },
  { text: 'I prefer to process difficult emotions alone before sharing', category: 'emotional' },
  { text: 'I feel closest to someone when we share comfortable silence', category: 'emotional' },
  { text: 'I need my partner to actively check in on how I\'m feeling', category: 'emotional' },
  { text: 'I find it hard to ask for emotional support', category: 'emotional' },
  { text: 'I express care by anticipating what my partner needs', category: 'emotional' },
  // Physical
  { text: 'Physical touch is the main way I feel connected', category: 'physical' },
  { text: 'I like holding hands in public', category: 'physical' },
  { text: 'I feel most intimate during quiet physical closeness, not just big gestures', category: 'physical' },
  { text: 'Morning cuddles are non-negotiable for me', category: 'physical' },
  { text: 'I value personal space even in a close relationship', category: 'physical' },
  { text: 'I express affection through playful physical contact', category: 'physical' },
  // Intellectual
  { text: 'Deep philosophical conversations make me feel deeply connected', category: 'intellectual' },
  { text: 'I need a partner who challenges my ideas', category: 'intellectual' },
  { text: 'Sharing books, articles, or podcasts is an act of intimacy for me', category: 'intellectual' },
  { text: 'I feel attracted to someone who teaches me new things', category: 'intellectual' },
  { text: 'Debating respectfully is one of my favorite forms of connection', category: 'intellectual' },
  // Social
  { text: 'I want my partner to be close friends with my friend group', category: 'social' },
  { text: 'I need alone time with my partner away from social settings', category: 'social' },
  { text: 'I prefer double dates over solo dates', category: 'social' },
  { text: 'How someone treats service workers matters more than how they treat me', category: 'social' },
  { text: 'I want a partner who is comfortable at big social gatherings', category: 'social' },
  // Spiritual / Values
  { text: 'Shared values matter more to me than shared interests', category: 'values' },
  { text: 'I feel most intimate when we talk about our purpose in life', category: 'values' },
  { text: 'I need a partner who has a similar relationship with faith or spirituality', category: 'values' },
  { text: 'Growing together as people is more important than growing as a couple', category: 'values' },
  { text: 'I feel close to someone when we dream about the future together', category: 'values' },
  { text: 'Giving back to the community together would strengthen our bond', category: 'values' },
];

// ─── Dream Board ───────────────────────────────────────────────

const DREAM_BOARD = [
  { text: 'Describe your ideal Saturday morning together', category: 'daily_life' },
  { text: 'What does your dream home look like in 5 years?', category: 'future' },
  { text: 'If we could travel anywhere together, where and why?', category: 'adventure' },
  { text: 'What tradition would you want us to create together?', category: 'rituals' },
  { text: 'Describe the perfect date night — no budget limits', category: 'romance' },
  { text: 'What skill or hobby would you love to learn together?', category: 'growth' },
  { text: 'If we could live in any city for a year, which one?', category: 'adventure' },
  { text: 'What does growing old together look like to you?', category: 'future' },
  { text: 'Describe a meal you\'d want to cook together', category: 'daily_life' },
  { text: 'What would our joint bucket list look like?', category: 'adventure' },
  { text: 'If we could start a project or business together, what would it be?', category: 'ambition' },
  { text: 'What kind of music would fill our home?', category: 'daily_life' },
  { text: 'Describe the perfect lazy Sunday — every detail', category: 'daily_life' },
  { text: 'What would our ideal anniversary celebration look like?', category: 'romance' },
  { text: 'If we could redesign a room together, what would it look like?', category: 'creative' },
  { text: 'What does our morning coffee or tea ritual look like?', category: 'rituals' },
  { text: 'What kind of pet would we have, if any?', category: 'daily_life' },
  { text: 'Describe a volunteer project we could do together', category: 'values' },
  { text: 'What does the perfect road trip together look like?', category: 'adventure' },
  { text: 'What book would we read together and discuss?', category: 'intellectual' },
  { text: 'If we hosted a dinner party, what would the vibe be?', category: 'social' },
  { text: 'Describe our ideal workout or wellness routine together', category: 'health' },
  { text: 'What would a typical Wednesday evening look like for us?', category: 'daily_life' },
  { text: 'What kind of garden or outdoor space would we create?', category: 'creative' },
  { text: 'If we could attend any event together — concert, game, festival — what would it be?', category: 'adventure' },
  { text: 'What does financial security look like to you as a couple?', category: 'future' },
  { text: 'Describe the perfect rainy day together — indoors all day', category: 'romance' },
  { text: 'What would our photo wall or memory corner look like?', category: 'rituals' },
  { text: 'If we had a shared playlist, what genre would dominate?', category: 'daily_life' },
  { text: 'What does support look like when one of us is having a hard week?', category: 'values' },
];

// ─── Blind Reveal ──────────────────────────────────────────────

const BLIND_REVEAL = [
  { text: 'What\'s a childhood memory that shaped who you are?', revealPrompt: 'Now share one your partner would never guess' },
  { text: 'What\'s a belief you held strongly but completely changed your mind about?', revealPrompt: 'What caused you to change?' },
  { text: 'What\'s something you\'re secretly really proud of?', revealPrompt: 'Why don\'t you usually share this?' },
  { text: 'What\'s the most adventurous thing you\'ve ever done?', revealPrompt: 'What\'s something adventurous you\'re too scared to try?' },
  { text: 'What\'s a talent or skill people don\'t know you have?', revealPrompt: 'How did you discover or develop it?' },
  { text: 'What\'s a song that always makes you emotional?', revealPrompt: 'What memory or feeling does it bring up?' },
  { text: 'What\'s the kindest thing a stranger has ever done for you?', revealPrompt: 'What\'s the kindest thing you\'ve done that nobody knows about?' },
  { text: 'What\'s your guilty pleasure that you never admit to?', revealPrompt: 'Why does it bring you joy?' },
  { text: 'What\'s a fear you\'ve overcome?', revealPrompt: 'What\'s a fear you still carry?' },
  { text: 'What\'s the best advice you\'ve ever received?', revealPrompt: 'What advice do you wish someone had given you sooner?' },
  { text: 'What\'s something you wish you could tell your younger self?', revealPrompt: 'What do you think your future self would tell you right now?' },
  { text: 'What\'s a place that feels like home to you — other than your actual home?', revealPrompt: 'Why does it feel that way?' },
  { text: 'What\'s a dream you gave up on?', revealPrompt: 'Do you ever wish you hadn\'t? Why?' },
  { text: 'What\'s the most meaningful compliment you\'ve ever received?', revealPrompt: 'What compliment do you wish someone would give you?' },
  { text: 'What\'s a moment where you felt truly seen by someone?', revealPrompt: 'What does being "truly seen" mean to you?' },
];

/**
 * Selects random, non-repeating items from an array.
 */
const selectRandom = (arr, count) => {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
};

module.exports = {
  WOULD_YOU_RATHER,
  TWO_TRUTHS_A_LIE_PROMPTS,
  NEVER_HAVE_I_EVER,
  WHAT_WOULD_YOU_DO,
  INTIMACY_SPECTRUM,
  DREAM_BOARD,
  BLIND_REVEAL,
  selectRandom,
};
