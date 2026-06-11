jest.mock('../../src/models/User');
jest.mock('../../src/models/Interaction', () => ({}));
jest.mock('../../src/models/Match', () => ({}));
jest.mock('../../src/models/Answer', () => ({}));
jest.mock('../../src/models/Question', () => ({}));
jest.mock('../../src/services/compatibility.service', () => ({ calculateCompatibility: jest.fn() }));
jest.mock('../../src/services/message.service', () => ({ createConversation: jest.fn() }));
jest.mock('../../src/services/upload.service', () => ({ getAccessibleUrl: jest.fn() }));
jest.mock('../../src/services/notification.service', () => ({ sendPush: jest.fn(), notifyNewMatch: jest.fn() }));
jest.mock('../../src/services/safety.service', () => ({
  isBlockedEither: jest.fn().mockResolvedValue(false),
  getBlockedIdSet: jest.fn().mockResolvedValue(new Set()),
}));
jest.mock('../../src/utils/cache', () => ({ invalidate: jest.fn(), getOrSet: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const User = require('../../src/models/User');
const DiscoverService = require('../../src/services/discover.service');

const lean = (v) => ({ lean: () => Promise.resolve(v) });

beforeEach(() => jest.clearAllMocks());

it('blocks Connect for a preview requester with complete_setup_required', async () => {
  // Match the real call order of User.findById inside likeUser:
  //   1) target-user validity check  2) requester profileStage gate.
  User.findById
    .mockReturnValueOnce(lean({ _id: 'target', isActive: true, isBanned: false }))
    .mockReturnValueOnce(lean({ _id: 'me', profileStage: 'preview' }));

  await expect(DiscoverService.likeUser('me', 'target')).rejects.toMatchObject({
    statusCode: 403,
    code: 'complete_setup_required',
  });
});

it('allows the gate to pass for a ready requester (reaches compatibility step)', async () => {
  const CompatibilityService = require('../../src/services/compatibility.service');
  // Past the gate, likeUser calls CompatibilityService.calculateCompatibility.
  // Make it throw a sentinel so we prove the gate did NOT block a ready user.
  CompatibilityService.calculateCompatibility.mockRejectedValue(
    Object.assign(new Error('reached_compat'), { sentinel: true })
  );
  User.findById
    .mockReturnValueOnce(lean({ _id: 'target', isActive: true, isBanned: false }))
    .mockReturnValueOnce(lean({ _id: 'me', profileStage: 'ready' }));

  await expect(DiscoverService.likeUser('me', 'target')).rejects.toMatchObject({ sentinel: true });
});
