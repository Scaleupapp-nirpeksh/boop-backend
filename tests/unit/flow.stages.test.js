jest.mock('../../src/utils/logger', () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
// profile.service.js imports these at module load; mock them so the suite can
// load without a live OpenAI key (they're irrelevant to stage logic).
jest.mock('../../src/services/transcription.service', () => class TranscriptionService {});
jest.mock('../../src/services/moderation.service', () => class ModerationService {});
const ProfileService = require('../../src/services/profile.service');

function makeUser(over = {}) {
  return { _id: 'u1', firstName: 'A', dateOfBirth: new Date('2000-01-01'), gender: 'male', interestedIn: 'women',
    questionsAnswered: 0, voiceIntro: {}, photos: { items: [] }, profileStage: 'incomplete', ...over };
}

describe('_checkAndAdvanceStage (reward-first)', () => {
  it('incomplete → preview at 8 answers with basic info', async () => {
    const u = makeUser({ questionsAnswered: 8 });
    await ProfileService._checkAndAdvanceStage(u);
    expect(u.profileStage).toBe('preview');
  });
  it('stays incomplete below 8 answers', async () => {
    const u = makeUser({ questionsAnswered: 7 });
    await ProfileService._checkAndAdvanceStage(u);
    expect(u.profileStage).toBe('incomplete');
  });
  it('preview → ready with voice + 3 photos', async () => {
    const u = makeUser({ profileStage: 'preview', questionsAnswered: 8, voiceIntro: { audioUrl: 'a' }, photos: { items: [{}, {}, {}] } });
    await ProfileService._checkAndAdvanceStage(u);
    expect(u.profileStage).toBe('ready');
  });
  it('preview stays preview with voice but only 2 photos', async () => {
    const u = makeUser({ profileStage: 'preview', questionsAnswered: 8, voiceIntro: { audioUrl: 'a' }, photos: { items: [{}, {}] } });
    await ProfileService._checkAndAdvanceStage(u);
    expect(u.profileStage).toBe('preview');
  });
});
