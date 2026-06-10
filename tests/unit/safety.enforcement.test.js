jest.mock('../../src/models/Conversation');
jest.mock('../../src/models/Message');
jest.mock('../../src/models/Match');
jest.mock('../../src/services/upload.service');
jest.mock('../../src/services/safety.service');
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const Conversation = require('../../src/models/Conversation');
const SafetyService = require('../../src/services/safety.service');
const MessageService = require('../../src/services/message.service');

beforeEach(() => jest.clearAllMocks());

describe('sendMessage block enforcement', () => {
  it('403s when either user has blocked the other', async () => {
    Conversation.findOne.mockResolvedValue({
      _id: 'c1',
      participants: ['u1', 'u2'],
      getOtherParticipantId: () => 'u2',
    });
    SafetyService.isBlockedEither.mockResolvedValue(true);

    await expect(
      MessageService.sendMessage('u1', 'c1', { type: 'text', text: 'hello there friend' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
