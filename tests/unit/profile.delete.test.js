jest.mock('../../src/models/User');
jest.mock('../../src/models/Match');
jest.mock('../../src/models/Conversation');
jest.mock('../../src/models/Answer');
jest.mock('../../src/models/Interaction');
jest.mock('../../src/models/Notification');
jest.mock('../../src/models/PersonalityAnalysis');
jest.mock('../../src/models/DatePlan');
jest.mock('../../src/services/upload.service');
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

// profile.service.js imports these at module load — mock them to avoid
// hitting the network or throwing due to missing API keys.
jest.mock('../../src/services/transcription.service', () => class TranscriptionService {});
jest.mock('../../src/services/moderation.service', () => class ModerationService {});
jest.mock('../../src/services/badge.service', () => ({
  BadgeService: { checkAndAwardBadges: jest.fn() },
}));
jest.mock('../../src/config/socket', () => ({ disconnectUser: jest.fn() }));

const User = require('../../src/models/User');
const Match = require('../../src/models/Match');
const Conversation = require('../../src/models/Conversation');
const Answer = require('../../src/models/Answer');
const Interaction = require('../../src/models/Interaction');
const Notification = require('../../src/models/Notification');
const PersonalityAnalysis = require('../../src/models/PersonalityAnalysis');
const DatePlan = require('../../src/models/DatePlan');
const UploadService = require('../../src/services/upload.service');
const ProfileService = require('../../src/services/profile.service');

const USER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

beforeEach(() => {
  jest.clearAllMocks();
  UploadService._extractS3Key = jest.fn((u) => u);
  UploadService.deleteAllUserMedia = jest.fn().mockResolvedValue(0);
  Match.updateMany.mockResolvedValue({});
  Conversation.updateMany.mockResolvedValue({});
  Answer.deleteMany.mockResolvedValue({});
  Interaction.deleteMany.mockResolvedValue({});
  Notification.deleteMany.mockResolvedValue({});
  PersonalityAnalysis.deleteMany.mockResolvedValue({});
  DatePlan.updateMany.mockResolvedValue({});
  User.findByIdAndUpdate.mockResolvedValue({});
});

describe('deleteAccount', () => {
  it('404s for unknown users', async () => {
    User.findById.mockResolvedValue(null);
    await expect(ProfileService.deleteAccount(USER_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deletes media, personal content, and anonymizes the user', async () => {
    User.findById.mockResolvedValue({
      _id: USER_ID,
      photos: {
        items: [{ s3Key: 'k1' }, { s3Key: 'k2' }],
        profilePhoto: { s3Key: 'pp', blurredUrl: 'pb', silhouetteUrl: 'ps' },
      },
      voiceIntro: { s3Key: 'vi' },
    });

    await ProfileService.deleteAccount(USER_ID);

    // S3 full-prefix purge (replaces per-key enumeration)
    expect(UploadService.deleteAllUserMedia).toHaveBeenCalledWith(USER_ID);

    expect(Match.updateMany).toHaveBeenCalled();
    expect(Conversation.updateMany).toHaveBeenCalled();
    expect(Answer.deleteMany).toHaveBeenCalledWith({ userId: USER_ID });
    expect(Interaction.deleteMany).toHaveBeenCalled();
    expect(Notification.deleteMany).toHaveBeenCalledWith({ userId: USER_ID });
    expect(PersonalityAnalysis.deleteMany).toHaveBeenCalledWith({ userId: USER_ID });

    const [, update] = User.findByIdAndUpdate.mock.calls[0];
    expect(update.$set.isActive).toBe(false);
    expect(update.$set.firstName).toBe('Deleted');
    expect(update.$set.phone).toMatch(/^\+999\d+$/);
    expect(update.$unset).toMatchObject({ fcmToken: 1, refreshToken: 1, voiceIntro: 1 });
  });
});
