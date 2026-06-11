const { matchConfidence } = require('../../src/services/question.service');

it('confidence monotonic, 0..100', () => {
  expect(matchConfidence(0)).toBe(0);
  expect(matchConfidence(8)).toBeGreaterThan(0);
  expect(matchConfidence(8)).toBeLessThan(matchConfidence(20));
  expect(matchConfidence(200)).toBeLessThanOrEqual(100);
});
