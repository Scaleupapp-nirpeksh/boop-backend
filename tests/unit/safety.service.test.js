jest.mock('../../src/models/Block');
jest.mock('../../src/models/Report');
jest.mock('../../src/models/User');
jest.mock('../../src/models/Match');
jest.mock('../../src/models/Conversation');
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const Block = require('../../src/models/Block');
const Report = require('../../src/models/Report');
const User = require('../../src/models/User');
const Match = require('../../src/models/Match');
const Conversation = require('../../src/models/Conversation');
const SafetyService = require('../../src/services/safety.service');
const { CONNECTION_STAGES } = require('../../src/utils/constants');

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const userChain = (result) => ({
  select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(result) }),
});

beforeEach(() => jest.clearAllMocks());

describe('blockUser', () => {
  it('rejects blocking yourself', async () => {
    await expect(SafetyService.blockUser(A, A)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('404s when the target does not exist', async () => {
    User.findById.mockReturnValue(userChain(null));
    await expect(SafetyService.blockUser(A, B)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('upserts the block and archives any active match', async () => {
    User.findById.mockReturnValue(userChain({ _id: B }));
    Block.updateOne.mockResolvedValue({});
    const match = { _id: 'm1', stage: 'connecting', isActive: true, save: jest.fn() };
    Match.findOne.mockResolvedValue(match);
    Conversation.updateOne.mockResolvedValue({});

    await SafetyService.blockUser(A, B);

    expect(Block.updateOne).toHaveBeenCalledWith(
      { blocker: A, blocked: B },
      { $setOnInsert: { blocker: A, blocked: B } },
      { upsert: true }
    );
    expect(match.stage).toBe(CONNECTION_STAGES.ARCHIVED);
    expect(match.isActive).toBe(false);
    expect(match.archiveReason).toBe('blocked');
    expect(match.archivedBy).toBe(A);
    expect(match.save).toHaveBeenCalled();
    expect(match.archivedAt).toBeInstanceOf(Date);
    expect(Conversation.updateOne).toHaveBeenCalledWith({ matchId: 'm1' }, { isActive: false });
  });

  it('works when there is no match between the users', async () => {
    User.findById.mockReturnValue(userChain({ _id: B }));
    Block.updateOne.mockResolvedValue({});
    Match.findOne.mockResolvedValue(null);
    await expect(SafetyService.blockUser(A, B)).resolves.toMatchObject({ blockedUserId: B });
  });
});

describe('unblockUser', () => {
  it('deletes the block and returns the unblocked id', async () => {
    Block.deleteOne.mockResolvedValue({});
    const result = await SafetyService.unblockUser(A, B);
    expect(Block.deleteOne).toHaveBeenCalledWith({ blocker: A, blocked: B });
    expect(result).toEqual({ unblockedUserId: B });
  });
});

describe('getBlockedUsers', () => {
  it('lists blocked users with a fallback name for deleted accounts', async () => {
    const chain = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { blocked: { _id: B, firstName: 'Priya' }, createdAt: new Date('2026-06-01') },
        { blocked: null, createdAt: new Date('2026-06-02') },
      ]),
    };
    Block.find.mockReturnValue(chain);

    const result = await SafetyService.getBlockedUsers(A);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ userId: B, firstName: 'Priya' });
    expect(result[1].firstName).toBe('Deleted user');
  });
});

describe('isBlockedEither', () => {
  it('is true when either direction exists', async () => {
    Block.exists.mockResolvedValue({ _id: 'x' });
    expect(await SafetyService.isBlockedEither(A, B)).toBe(true);
  });
  it('is false when no block exists', async () => {
    Block.exists.mockResolvedValue(null);
    expect(await SafetyService.isBlockedEither(A, B)).toBe(false);
  });
});

describe('getBlockedIdSet', () => {
  it('returns ids from both directions', async () => {
    Block.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { blocker: A, blocked: B },
        { blocker: 'cccccccccccccccccccccccc', blocked: A },
      ]),
    });
    const set = await SafetyService.getBlockedIdSet(A);
    expect(set.has(B)).toBe(true);
    expect(set.has('cccccccccccccccccccccccc')).toBe(true);
    expect(set.size).toBe(2);
  });
});

describe('reportUser', () => {
  it('rejects self-reports', async () => {
    await expect(
      SafetyService.reportUser(A, { reportedUserId: A, reason: 'spam' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects unknown reasons', async () => {
    await expect(
      SafetyService.reportUser(A, { reportedUserId: B, reason: 'nope' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates a pending report', async () => {
    User.findById.mockReturnValue(userChain({ _id: B }));
    Report.create.mockResolvedValue({ _id: 'r1', status: 'pending' });
    const result = await SafetyService.reportUser(A, {
      reportedUserId: B,
      reason: 'harassment',
      details: 'said awful things',
    });
    expect(Report.create).toHaveBeenCalledWith(
      expect.objectContaining({ reporter: A, reported: B, reason: 'harassment' })
    );
    expect(result).toEqual({ reportId: 'r1', status: 'pending' });
  });

  it('404s when the reported user does not exist', async () => {
    User.findById.mockReturnValue(userChain(null));
    await expect(
      SafetyService.reportUser(A, { reportedUserId: B, reason: 'spam' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('forwards contentType and messageId for message reports', async () => {
    User.findById.mockReturnValue(userChain({ _id: B }));
    Report.create.mockResolvedValue({ _id: 'r2', status: 'pending' });
    await SafetyService.reportUser(A, {
      reportedUserId: B,
      reason: 'inappropriate_messages',
      contentType: 'message',
      messageId: 'msg1',
    });
    expect(Report.create).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'message', messageId: 'msg1' })
    );
  });
});
