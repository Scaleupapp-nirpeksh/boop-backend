// Mock the model + cache so getArchetypeRarity is unit-testable without a DB.
jest.mock('../../src/models/PersonalityAnalysis', () => ({ aggregate: jest.fn() }));
jest.mock('../../src/models/Answer', () => ({}));
jest.mock('../../src/models/Question', () => ({}));
jest.mock('../../src/models/User', () => ({}));
jest.mock('../../src/utils/logger', () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() }));
jest.mock('../../src/utils/cache', () => ({
  // Pass-through: always invoke the fetch fn (no caching) for deterministic tests.
  getOrSet: jest.fn((key, ttl, fetchFn) => fetchFn()),
}));

const { ARCHETYPES, findByCode, ARCHETYPE_CODES } = require('../../src/utils/archetypes');
const PersonalityAnalysis = require('../../src/models/PersonalityAnalysis');
const PersonalityService = require('../../src/services/personality.service');

describe('archetype catalog', () => {
  it('has ≥12 archetypes with unique codes + numbers', () => {
    expect(ARCHETYPES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(ARCHETYPES.map((a) => a.code)).size).toBe(ARCHETYPES.length);
    expect(new Set(ARCHETYPES.map((a) => a.number)).size).toBe(ARCHETYPES.length);
    ARCHETYPES.forEach((a) => {
      expect(a.name).toBeTruthy();
      expect(a.essence).toBeTruthy();
      expect(a.signature).toBeTruthy();
    });
  });

  it('findByCode returns the archetype or null', () => {
    expect(findByCode(ARCHETYPE_CODES[0]).code).toBe(ARCHETYPE_CODES[0]);
    expect(findByCode('NOPE')).toBeNull();
  });
});

describe('PersonalityService.getArchetypeRarity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('computes round(100 * count / total) from the cached distribution', async () => {
    // ARCH_01 = 3 of 10 completed → 30%
    PersonalityAnalysis.aggregate.mockResolvedValue([
      { _id: 'ARCH_01', count: 3 },
      { _id: 'ARCH_02', count: 7 },
    ]);
    expect(await PersonalityService.getArchetypeRarity('ARCH_01')).toBe(30);
    expect(await PersonalityService.getArchetypeRarity('ARCH_02')).toBe(70);
  });

  it('returns 0 for a code that has no completed analyses', async () => {
    PersonalityAnalysis.aggregate.mockResolvedValue([{ _id: 'ARCH_01', count: 5 }]);
    expect(await PersonalityService.getArchetypeRarity('ARCH_09')).toBe(0);
  });

  it('avoids divide-by-zero when there are no completed analyses', async () => {
    PersonalityAnalysis.aggregate.mockResolvedValue([]);
    expect(await PersonalityService.getArchetypeRarity('ARCH_01')).toBe(0);
  });

  it('returns 0 for a falsy code without hitting the DB', async () => {
    expect(await PersonalityService.getArchetypeRarity(null)).toBe(0);
    expect(PersonalityAnalysis.aggregate).not.toHaveBeenCalled();
  });
});

describe('PersonalityService._resolveArchetype (deterministic fallback)', () => {
  it('trusts a valid AI archetypeCode', () => {
    expect(PersonalityService._resolveArchetype({ archetypeCode: 'ARCH_05' }).code).toBe('ARCH_05');
  });

  it('falls back to ARCH_01 when there is no code and no facets', () => {
    expect(PersonalityService._resolveArchetype({}).code).toBe('ARCH_01');
  });

  it('is deterministic: same top facet key always maps to the same archetype', () => {
    const result = { facets: [{ key: 'communication', score: 90 }, { key: 'lifestyle', score: 40 }] };
    const a = PersonalityService._resolveArchetype(result);
    const b = PersonalityService._resolveArchetype(result);
    expect(a.code).toBe(b.code);
    expect(ARCHETYPE_CODES).toContain(a.code);
  });
});
