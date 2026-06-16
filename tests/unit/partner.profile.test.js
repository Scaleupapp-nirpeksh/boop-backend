jest.mock('../../src/models/Match', () => ({ findOne: jest.fn() }));
jest.mock('../../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../../src/models/Conversation', () => ({}));
jest.mock('../../src/models/Message', () => ({}));
jest.mock('../../src/models/Game', () => ({}));
jest.mock('../../src/models/PersonalityAnalysis', () => ({ findOne: jest.fn() }));
jest.mock('../../src/services/upload.service', () => ({ getAccessibleUrl: jest.fn() }));
jest.mock('../../src/services/notification.service', () => ({ sendPush: jest.fn() }));
jest.mock('../../src/services/personality.service', () => ({ getArchetypeRarity: jest.fn() }));
jest.mock('../../src/services/discover.service', () => ({ _getShowcaseAnswers: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const Match = require('../../src/models/Match');
const PersonalityAnalysis = require('../../src/models/PersonalityAnalysis');
const UploadService = require('../../src/services/upload.service');
const PersonalityService = require('../../src/services/personality.service');
const DiscoverService = require('../../src/services/discover.service');
const MatchService = require('../../src/services/match.service');

const REQUESTER_ID = 'requester-user-id';
const PARTNER_ID = 'partner-user-id';
const MATCH_ID = 'match-id-1';

// Mirrors Match.findOne(...).populate(...).lean() used by match detail access.
const populateLean = (v) => ({ populate: () => ({ lean: () => Promise.resolve(v) }) });
// Mirrors PersonalityAnalysis.findOne(...).sort(...).lean() from personality.service.
const sortLean = (v) => ({ sort: () => ({ lean: () => Promise.resolve(v) }) });

const partnerUser = (overrides = {}) => ({
  _id: PARTNER_ID,
  firstName: 'Asha',
  dateOfBirth: new Date(Date.now() - 28.5 * 365.25 * 24 * 60 * 60 * 1000), // ~28 years old
  location: { city: 'Pune' },
  bio: { text: 'Chai over coffee, always.' },
  voiceIntro: { audioUrl: 'voice/asha.m4a', duration: 23 },
  photos: {
    profilePhoto: {
      url: 'photos/asha-clear.jpg',
      blurredUrl: 'photos/asha-blurred.jpg',
      silhouetteUrl: 'photos/asha-silhouette.jpg',
    },
  },
  questionsAnswered: 34,
  ...overrides,
});

const matchDoc = (overrides = {}) => ({
  _id: MATCH_ID,
  stage: 'connecting',
  isActive: true,
  users: [{ _id: REQUESTER_ID, firstName: 'Me' }, partnerUser()],
  ...overrides,
});

const completedAnalysis = (overrides = {}) => ({
  userId: PARTNER_ID,
  status: 'completed',
  archetypeCode: 'ARCH_01',
  facets: [
    {
      key: 'emotional_openness',
      title: 'Emotional Openness',
      score: 82,
      description: 'PRIVATE-FACET-PROSE',
      emoji: '💗',
    },
    {
      key: 'adventurousness',
      title: 'Adventurousness',
      score: 74,
      description: 'PRIVATE-FACET-PROSE',
      emoji: '🧭',
    },
  ],
  summary: 'PRIVATE-SUMMARY-TEXT',
  numerology: { lifePathNumber: 7, traits: ['seeker'], description: 'PRIVATE-NUMEROLOGY-TEXT' },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  UploadService.getAccessibleUrl.mockImplementation(async (u) => u);
  PersonalityService.getArchetypeRarity.mockResolvedValue(9);
  DiscoverService._getShowcaseAnswers.mockResolvedValue([]);
  PersonalityAnalysis.findOne.mockReturnValue(sortLean(null));
});

describe('getPartnerProfile access control', () => {
  it('404s when the requester is not a participant of an active match (same as match detail)', async () => {
    // The participant + isActive constraints live in the query itself, so a
    // non-participant (or a blocked/archived pair) simply finds no match.
    Match.findOne.mockReturnValue(populateLean(null));

    await expect(
      MatchService.getPartnerProfile(REQUESTER_ID, MATCH_ID)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Match not found' });

    expect(Match.findOne).toHaveBeenCalledWith({
      _id: MATCH_ID,
      users: REQUESTER_ID,
      isActive: true,
    });
  });
});

describe('getPartnerProfile payload', () => {
  it('returns the contract shape for a participant, with archetype and facets — and never leaks summary/numerology or the partner\'s written answers', async () => {
    Match.findOne.mockReturnValue(populateLean(matchDoc()));
    PersonalityAnalysis.findOne.mockReturnValue(sortLean(completedAnalysis()));
    // Even if the discover showcase util were to return verbatim answers, the
    // partner-profile endpoint must not surface them. Stub it so we can assert
    // it is not consulted and none of its text reaches the payload.
    DiscoverService._getShowcaseAnswers.mockResolvedValue([
      {
        questionText: 'What does a perfect Sunday look like?',
        dimension: 'lifestyle_rhythm',
        depthLevel: 'surface',
        answer: 'PRIVATE-WRITTEN-ANSWER-ONE',
        questionType: 'text',
      },
      {
        questionText: 'What makes you feel safe with someone?',
        dimension: 'emotional_vulnerability',
        depthLevel: 'moderate',
        answer: 'PRIVATE-WRITTEN-ANSWER-TWO',
        questionType: 'text',
      },
    ]);

    const result = await MatchService.getPartnerProfile(REQUESTER_ID, MATCH_ID);

    expect(result.partner).toMatchObject({
      userId: PARTNER_ID,
      firstName: 'Asha',
      age: 28,
      city: 'Pune',
      bio: 'Chai over coffee, always.',
      voiceIntro: { audioUrl: 'voice/asha.m4a', duration: 23 },
      questionsAnswered: 34,
      archetype: {
        code: 'ARCH_01',
        number: 1,
        name: 'The Gentle Adventurer',
        rarityPercent: 9,
      },
    });
    expect(typeof result.partner.archetype.essence).toBe('string');
    expect(result.partner.archetype.essence.length).toBeGreaterThan(0);

    // Facets: key/title/score ONLY — no descriptions, no emoji, no prose.
    expect(result.partner.facets).toEqual([
      { key: 'emotional_openness', title: 'Emotional Openness', score: 82 },
      { key: 'adventurousness', title: 'Adventurousness', score: 74 },
    ]);

    // PRIVACY: the partner's verbatim written answers ("showcase answers") must
    // NOT be returned — the field is gone and the util is never consulted.
    expect(result.partner.showcaseAnswers).toBeUndefined();
    expect(DiscoverService._getShowcaseAnswers).not.toHaveBeenCalled();

    // PRIVACY: no `summary`/`numerology`/showcase keys (or their contents) anywhere.
    const json = JSON.stringify(result);
    expect(json).not.toContain('"summary"');
    expect(json).not.toContain('"numerology"');
    expect(json).not.toContain('"showcaseAnswers"');
    expect(json).not.toContain('PRIVATE-SUMMARY-TEXT');
    expect(json).not.toContain('PRIVATE-NUMEROLOGY-TEXT');
    expect(json).not.toContain('PRIVATE-FACET-PROSE');
    expect(json).not.toContain('PRIVATE-WRITTEN-ANSWER-ONE');
    expect(json).not.toContain('PRIVATE-WRITTEN-ANSWER-TWO');
    expect(json).not.toContain('lifePathNumber');
  });

  it('returns archetype: null and facets: [] when the partner has no completed analysis', async () => {
    Match.findOne.mockReturnValue(populateLean(matchDoc()));
    PersonalityAnalysis.findOne.mockReturnValue(sortLean(null));

    const result = await MatchService.getPartnerProfile(REQUESTER_ID, MATCH_ID);

    expect(result.partner.archetype).toBeNull();
    expect(result.partner.facets).toEqual([]);
    expect(PersonalityAnalysis.findOne).toHaveBeenCalledWith({
      userId: PARTNER_ID,
      status: 'completed',
    });
  });
});

describe('getPartnerProfile photo reveal state', () => {
  it('keeps clearUrl null before reveal (blurred/silhouette serve instead)', async () => {
    // 'connecting' is pre-reveal: same rule as match detail (REVEALED/DATING only).
    Match.findOne.mockReturnValue(populateLean(matchDoc({ stage: 'connecting' })));

    const result = await MatchService.getPartnerProfile(REQUESTER_ID, MATCH_ID);

    expect(result.partner.photos).toEqual({
      blurredUrl: 'photos/asha-blurred.jpg',
      silhouetteUrl: 'photos/asha-silhouette.jpg',
      clearUrl: null,
    });
  });

  it('exposes clearUrl once the match has revealed photos', async () => {
    Match.findOne.mockReturnValue(populateLean(matchDoc({ stage: 'revealed' })));

    const result = await MatchService.getPartnerProfile(REQUESTER_ID, MATCH_ID);

    expect(result.partner.photos.clearUrl).toBe('photos/asha-clear.jpg');
  });
});
