// Answer history: voice transcript surfacing + question snapshots for orphaned answers.
jest.mock('../../src/models/User');
jest.mock('../../src/models/Answer', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../../src/models/Question', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock('../../src/services/personality.service', () => ({
  checkAndTriggerAnalysis: jest.fn(),
}));
jest.mock('../../src/services/badge.service', () => ({
  BadgeService: { checkAndAwardBadges: jest.fn(() => Promise.resolve()) },
}));
jest.mock('../../src/services/embedding.service', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../src/utils/cache', () => ({
  getOrSet: jest.fn(),
  invalidate: jest.fn(),
  invalidatePattern: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const mockTranscriptionCreate = jest.fn();
jest.mock('openai', () => jest.fn(() => ({
  audio: { transcriptions: { create: mockTranscriptionCreate } },
})));

const Answer = require('../../src/models/Answer');
const Question = require('../../src/models/Question');
const User = require('../../src/models/User');
const QuestionService = require('../../src/services/question.service');
const TranscriptionService = require('../../src/services/transcription.service');

// Match the exact call shapes used by getAnswerHistory:
//   Answer.find({ userId }).sort({ submittedAt: -1 }).lean()
//   Question.find({ questionNumber: { $in: [...] } }).lean()
const answerFindChain = (docs) => ({ sort: () => ({ lean: () => Promise.resolve(docs) }) });
const questionFindChain = (docs) => ({ lean: () => Promise.resolve(docs) });

beforeEach(() => jest.clearAllMocks());

describe('getAnswerHistory — voice transcript surfacing', () => {
  it('falls back to textAnswer as the transcript for voice answers missing voiceAnswerTranscript', async () => {
    Answer.find.mockReturnValue(answerFindChain([
      {
        _id: 'a1',
        questionNumber: 12,
        voiceAnswerTranscript: null,
        textAnswer: 'hello world',
        voiceAnswerUrl: 'u',
        selectedOptions: [],
        submittedAt: new Date('2026-06-01'),
      },
    ]));
    Question.find.mockReturnValue(questionFindChain([
      { questionNumber: 12, questionText: 'Describe your ideal Sunday', dimension: 'lifestyle', questionType: 'text' },
    ]));

    const { history } = await QuestionService.getAnswerHistory('u1');

    expect(history).toHaveLength(1);
    expect(history[0].voiceAnswerTranscript).toBe('hello world');
    expect(history[0].isVoice).toBe(true);
  });

  it('does NOT surface textAnswer as a transcript for non-voice answers', async () => {
    Answer.find.mockReturnValue(answerFindChain([
      {
        _id: 'a2',
        questionNumber: 3,
        voiceAnswerTranscript: null,
        textAnswer: 'typed answer',
        voiceAnswerUrl: null,
        selectedOptions: [],
        submittedAt: new Date('2026-06-02'),
      },
    ]));
    Question.find.mockReturnValue(questionFindChain([
      { questionNumber: 3, questionText: 'Q3', dimension: 'values', questionType: 'text' },
    ]));

    const { history } = await QuestionService.getAnswerHistory('u1');

    expect(history[0].voiceAnswerTranscript).toBeNull();
    expect(history[0].isVoice).toBe(false);
  });
});

describe('getAnswerHistory — orphaned answers (question deleted from catalog)', () => {
  it('labels an orphaned answer without snapshots as seasonal with empty question text', async () => {
    Answer.find.mockReturnValue(answerFindChain([
      {
        _id: 'a3',
        questionNumber: 63,
        textAnswer: 'pumpkin spice everything',
        selectedOptions: [],
        submittedAt: new Date('2026-05-20'),
      },
    ]));
    Question.find.mockReturnValue(questionFindChain([]));

    const { history, groupedByDimension } = await QuestionService.getAnswerHistory('u1');

    expect(history[0].dimension).toBe('seasonal');
    expect(history[0].questionText).toBe('');
    expect(history[0].questionType).toBe('text');
    expect(groupedByDimension.seasonal).toHaveLength(1);
  });

  it('uses submit-time snapshots when the question no longer exists', async () => {
    Answer.find.mockReturnValue(answerFindChain([
      {
        _id: 'a4',
        questionNumber: 71,
        textAnswer: 'at a bonfire',
        questionTextSnapshot: 'Where do you feel most alive in winter?',
        dimensionSnapshot: 'lifestyle',
        questionTypeSnapshot: 'text',
        selectedOptions: [],
        submittedAt: new Date('2026-05-21'),
      },
    ]));
    Question.find.mockReturnValue(questionFindChain([]));

    const { history, groupedByDimension } = await QuestionService.getAnswerHistory('u1');

    expect(history[0].questionText).toBe('Where do you feel most alive in winter?');
    expect(history[0].dimension).toBe('lifestyle');
    expect(history[0].questionType).toBe('text');
    expect(groupedByDimension.lifestyle).toHaveLength(1);
  });

  it('prefers live question data over stale snapshots', async () => {
    Answer.find.mockReturnValue(answerFindChain([
      {
        _id: 'a5',
        questionNumber: 9,
        textAnswer: 'x',
        questionTextSnapshot: 'Old text',
        dimensionSnapshot: 'old_dimension',
        questionTypeSnapshot: 'single_choice',
        selectedOptions: [],
        submittedAt: new Date('2026-05-22'),
      },
    ]));
    Question.find.mockReturnValue(questionFindChain([
      { questionNumber: 9, questionText: 'Current text', dimension: 'emotional', questionType: 'text' },
    ]));

    const { history } = await QuestionService.getAnswerHistory('u1');

    expect(history[0].questionText).toBe('Current text');
    expect(history[0].dimension).toBe('emotional');
    expect(history[0].questionType).toBe('text');
  });
});

describe('submitAnswer — question snapshots persisted on the Answer', () => {
  it('stores questionText/dimension/questionType snapshots at submit time', async () => {
    Question.findOne.mockResolvedValue({
      _id: 'q5',
      questionNumber: 5,
      questionText: 'Pick a vibe',
      dimension: 'values',
      questionType: 'single_choice',
      options: ['calm', 'chaos'],
      dayAvailable: 1,
    });
    Answer.findOne.mockResolvedValue(null); // not already answered
    User.findById.mockResolvedValue({
      _id: 'u1',
      createdAt: new Date(),
      questionsAnswered: 0,
      profileStage: 'incomplete',
      save: jest.fn().mockResolvedValue(undefined),
    });
    Answer.create.mockResolvedValue({ _id: 'a9' });

    await QuestionService.submitAnswer('u1', 5, { selectedOption: 'calm' });

    expect(Answer.create).toHaveBeenCalledWith(expect.objectContaining({
      questionTextSnapshot: 'Pick a vibe',
      dimensionSnapshot: 'values',
      questionTypeSnapshot: 'single_choice',
    }));
  });
});

describe('transcribeVoiceAnswer — transcript written to voiceAnswerTranscript', () => {
  it('writes the transcript to both textAnswer and voiceAnswerTranscript on success', async () => {
    mockTranscriptionCreate.mockResolvedValue('hello from whisper');
    Answer.findByIdAndUpdate.mockResolvedValue({});

    await TranscriptionService.transcribeVoiceAnswer('a1', Buffer.from('audio'), 'clip.m4a');

    expect(Answer.findByIdAndUpdate).toHaveBeenCalledWith('a1', {
      textAnswer: 'hello from whisper',
      voiceAnswerTranscript: 'hello from whisper',
      transcriptionPending: false,
    });
  });

  it('writes the failure placeholder to both fields when transcription comes back empty', async () => {
    mockTranscriptionCreate.mockResolvedValue('');
    Answer.findByIdAndUpdate.mockResolvedValue({});

    await TranscriptionService.transcribeVoiceAnswer('a1', Buffer.from('audio'), 'clip.m4a');

    expect(Answer.findByIdAndUpdate).toHaveBeenCalledWith('a1', {
      textAnswer: '[Voice answer — transcription failed]',
      voiceAnswerTranscript: '[Voice answer — transcription failed]',
      transcriptionPending: false,
    });
  });
});
