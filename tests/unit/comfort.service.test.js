jest.mock('../../src/models/Match');
jest.mock('../../src/models/Conversation');
jest.mock('../../src/models/Message');
jest.mock('../../src/models/Game');
jest.mock('../../src/models/ScoreSnapshot');
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const Match = require('../../src/models/Match');
const Conversation = require('../../src/models/Conversation');
const Message = require('../../src/models/Message');
const Game = require('../../src/models/Game');
const ScoreSnapshot = require('../../src/models/ScoreSnapshot');
const ComfortService = require('../../src/services/comfort.service');

const USER1 = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const USER2 = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const msg = (sender, type, text, daysAgo = 0) => ({
  senderId: sender,
  type,
  content: { text },
  createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
});

const setupMocks = (messages, { completedGames = 0, deepGames = 0 } = {}) => {
  const match = {
    _id: 'match1',
    users: [USER1, USER2],
    comfortScore: 0,
    save: jest.fn().mockResolvedValue(undefined),
  };
  Match.findById.mockResolvedValue(match);
  Conversation.findOne.mockResolvedValue({ _id: 'conv1' });
  Message.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(messages),
    }),
  });
  Game.countDocuments
    .mockResolvedValueOnce(completedGames)
    .mockResolvedValueOnce(deepGames);
  ScoreSnapshot.findOne.mockReturnValue({
    sort: jest.fn().mockResolvedValue(null),
  });
  ScoreSnapshot.create.mockResolvedValue({});
  return match;
};

beforeEach(() => jest.clearAllMocks());

describe('comfort score hardening', () => {
  it('short-message spam cannot reach the reveal threshold', async () => {
    const messages = [];
    for (let i = 0; i < 100; i++) {
      messages.push(msg(USER1, 'text', 'k'));
      messages.push(msg(USER2, 'text', 'k'));
    }
    setupMocks(messages, { completedGames: 3, deepGames: 2 });

    const { score } = await ComfortService.calculateComfortScore('match1');
    expect(score).toBeLessThan(70);
  });

  it('a single-day flood of quality messages cannot reach the threshold', async () => {
    const longText = 'This is a long, genuinely substantive message to inflate volume.';
    const messages = [];
    for (let i = 0; i < 100; i++) {
      messages.push(msg(USER1, 'text', longText));
      messages.push(msg(USER2, 'text', longText));
    }
    setupMocks(messages, { completedGames: 3, deepGames: 2 });

    const { score } = await ComfortService.calculateComfortScore('match1');
    expect(score).toBeLessThan(70);
  });

  it('system messages (boops) never count', async () => {
    const messages = [];
    for (let i = 0; i < 200; i++) messages.push(msg(USER1, 'system', 'sent a boop! 💕'));
    setupMocks(messages);

    const { score, breakdown } = await ComfortService.calculateComfortScore('match1');
    expect(breakdown.messageVolume.value).toBe(0);
    expect(score).toBe(0);
  });

  it('a genuine multi-day conversation reaches the threshold', async () => {
    const longText =
      'A thoughtful message that says something real about my day and how I feel about it.';
    const messages = [];
    for (let day = 0; day < 10; day++) {
      for (let i = 0; i < 5; i++) {
        messages.push(msg(USER1, 'text', longText, day));
        messages.push(msg(USER2, 'text', longText, day));
      }
    }
    for (let day = 0; day < 4; day++) {
      messages.push(msg(USER1, 'voice', null, day));
    }
    setupMocks(messages, { completedGames: 3, deepGames: 2 });

    const { score } = await ComfortService.calculateComfortScore('match1');
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it('persists activeDays and qualityMessages for the reveal floor', async () => {
    const messages = [
      msg(USER1, 'text', 'This message is definitely long enough to count.', 2),
      msg(USER2, 'text', 'This reply is also long enough to count toward quality.', 1),
      msg(USER1, 'text', 'And one more quality message today to make three days.', 0),
    ];
    const match = setupMocks(messages);

    await ComfortService.calculateComfortScore('match1');

    expect(match.comfortStats).toEqual({ activeDays: 3, qualityMessages: 3 });
  });
});
