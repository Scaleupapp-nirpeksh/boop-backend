const mockCreate = jest.fn();
jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    moderations: { create: mockCreate },
  }))
);
jest.mock('../../src/models/ModerationFlag');
jest.mock('../../src/models/Message');
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const ModerationFlag = require('../../src/models/ModerationFlag');
const Message = require('../../src/models/Message');
const ModerationService = require('../../src/services/moderation.service');

beforeEach(() => jest.clearAllMocks());

describe('moderateText', () => {
  it('maps flagged categories', async () => {
    mockCreate.mockResolvedValue({
      results: [{ flagged: true, categories: { harassment: true, sexual: false } }],
    });
    const result = await ModerationService.moderateText('abusive text');
    expect(result.flagged).toBe(true);
    expect(result.categories).toEqual(['harassment']);
    expect(result.severe).toBe(false);
  });

  it('marks severe categories', async () => {
    mockCreate.mockResolvedValue({
      results: [{ flagged: true, categories: { 'sexual/minors': true } }],
    });
    const result = await ModerationService.moderateText('x');
    expect(result.severe).toBe(true);
  });

  it('fails open when the API errors', async () => {
    mockCreate.mockRejectedValue(new Error('api down'));
    const result = await ModerationService.moderateText('x');
    expect(result.flagged).toBe(false);
    expect(result.failedOpen).toBe(true);
  });
});

describe('shouldBlockPhoto', () => {
  it('blocks sexual content', () => {
    expect(ModerationService.shouldBlockPhoto({ flagged: true, categories: ['sexual'] })).toBe(true);
  });
  it('does not block non-listed categories', () => {
    expect(ModerationService.shouldBlockPhoto({ flagged: true, categories: ['harassment'] })).toBe(false);
  });
  it('never blocks unflagged results', () => {
    expect(ModerationService.shouldBlockPhoto({ flagged: false, categories: [] })).toBe(false);
  });
});

describe('reviewMessage', () => {
  const message = {
    _id: 'm1',
    senderId: 'u1',
    conversationId: 'c1',
    content: { text: 'some text' },
  };

  it('creates a flag and hides severe messages', async () => {
    mockCreate.mockResolvedValue({
      results: [{ flagged: true, categories: { 'sexual/minors': true } }],
    });
    ModerationFlag.create.mockResolvedValue({});
    Message.findByIdAndUpdate.mockResolvedValue({});

    await ModerationService.reviewMessage(message);

    expect(ModerationFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({ severe: true, autoHidden: true, messageId: 'm1' })
    );
    expect(Message.findByIdAndUpdate).toHaveBeenCalledWith('m1', { isDeleted: true });
  });

  it('flags but does not hide non-severe content', async () => {
    mockCreate.mockResolvedValue({
      results: [{ flagged: true, categories: { harassment: true } }],
    });
    ModerationFlag.create.mockResolvedValue({});

    await ModerationService.reviewMessage(message);

    expect(ModerationFlag.create).toHaveBeenCalled();
    expect(Message.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('does nothing for clean messages', async () => {
    mockCreate.mockResolvedValue({ results: [{ flagged: false, categories: {} }] });
    await ModerationService.reviewMessage(message);
    expect(ModerationFlag.create).not.toHaveBeenCalled();
  });

  it('truncates excerpts by code point, not UTF-16 unit', async () => {
    const fire = '🔥'.repeat(200); // 400 UTF-16 units, 200 code points
    mockCreate.mockResolvedValue({
      results: [{ flagged: true, categories: { harassment: true } }],
    });
    ModerationFlag.create.mockResolvedValue({});

    await ModerationService.reviewMessage({ ...message, content: { text: fire } });

    const excerpt = ModerationFlag.create.mock.calls[0][0].excerpt;
    expect([...excerpt]).toHaveLength(200);
    expect(excerpt.includes('�')).toBe(false);
  });
});
