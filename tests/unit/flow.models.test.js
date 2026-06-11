const User = require('../../src/models/User');
const Question = require('../../src/models/Question');
const Answer = require('../../src/models/Answer');
const mongoose = require('mongoose');

describe('flow model fields', () => {
  it('User.profileStage accepts preview', () => {
    const u = new User({ phone: '+919876543210', profileStage: 'preview' });
    const err = u.validateSync();
    expect(err?.errors?.profileStage).toBeUndefined();
  });
  it('User.profileStage rejects an unknown stage', () => {
    const u = new User({ phone: '+919876543210', profileStage: 'nope' });
    expect(u.validateSync()?.errors?.profileStage).toBeDefined();
  });
  it('Question has an isOnboarding boolean defaulting false', () => {
    const q = new Question({ questionNumber: 1, dimension: 'life_vision', depthLevel: 'surface', questionText: 'x', questionType: 'single_choice', dayAvailable: 1, order: 1 });
    expect(q.isOnboarding).toBe(false);
  });
  it('Answer has a voiceAnswerTranscript field', () => {
    const a = new Answer({ userId: new mongoose.Types.ObjectId(), questionId: new mongoose.Types.ObjectId(), questionNumber: 1, voiceAnswerTranscript: 'hello' });
    expect(a.voiceAnswerTranscript).toBe('hello');
  });
});
