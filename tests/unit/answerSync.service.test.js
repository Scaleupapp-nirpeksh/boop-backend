jest.mock('../../src/models/Answer', () => ({ find: jest.fn() }));
jest.mock('../../src/models/Question', () => ({ find: jest.fn() }));

const Answer = require('../../src/models/Answer');
const Question = require('../../src/models/Question');
const AnswerSyncService = require('../../src/services/answerSync.service');

const lean = (docs) => ({ select: () => ({ lean: () => Promise.resolve(docs) }), lean: () => Promise.resolve(docs) });

describe('AnswerSyncService.computeBuckets', () => {
  it('buckets common questions by similarity and ignores non-common ones', async () => {
    Answer.find
      .mockReturnValueOnce(lean([ // user A
        { questionNumber: 1, selectedOption: 'A' },
        { questionNumber: 2, selectedOption: 'A' },
        { questionNumber: 9, selectedOption: 'A' }, // not common
      ]))
      .mockReturnValueOnce(lean([ // user B
        { questionNumber: 1, selectedOption: 'A' }, // exact -> highly_in_sync
        { questionNumber: 2, selectedOption: 'B' }, // mismatch -> poles_apart
      ]));
    Question.find.mockReturnValue({ lean: () => Promise.resolve([
      { questionNumber: 1, questionType: 'single_choice', dimension: 'love_expression' },
      { questionNumber: 2, questionType: 'single_choice', dimension: 'conflict_resolution' },
    ])});

    const res = await AnswerSyncService.computeBuckets('a', 'b');
    expect(res.totalCommon).toBe(2);
    const byLevel = Object.fromEntries(res.questions.map((q) => [q.questionNumber, q.syncLevel]));
    expect(byLevel[1]).toBe('highly_in_sync');
    expect(byLevel[2]).toBe('poles_apart');
    const counts = Object.fromEntries(res.buckets.map((b) => [b.key, b.count]));
    expect(counts.highly_in_sync).toBe(1);
    expect(counts.poles_apart).toBe(1);
  });
});
