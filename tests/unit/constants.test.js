const {
  DIMENSIONS,
  DIMENSION_WEIGHTS,
  CONNECTION_STAGES,
  STAGE_TRANSITIONS,
  COMFORT_WEIGHTS,
  COMFORT_REVEAL_THRESHOLD,
  DATE_READINESS_WEIGHTS,
  GAME_TYPES,
  MATCH_TIERS,
} = require('../../src/utils/constants');

describe('Constants', () => {
  describe('DIMENSION_WEIGHTS', () => {
    it('has a weight for every dimension', () => {
      const dims = Object.values(DIMENSIONS);
      for (const dim of dims) {
        expect(DIMENSION_WEIGHTS[dim]).toBeDefined();
        expect(typeof DIMENSION_WEIGHTS[dim]).toBe('number');
      }
    });

    it('weights sum to 1.0', () => {
      const sum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    });
  });

  describe('COMFORT_WEIGHTS', () => {
    it('weights sum to 1.0', () => {
      const sum = Object.values(COMFORT_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    });
  });

  describe('DATE_READINESS_WEIGHTS', () => {
    it('weights sum to 1.0', () => {
      const sum = Object.values(DATE_READINESS_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    });
  });

  describe('CONNECTION_STAGES', () => {
    it('has 8 stages', () => {
      expect(Object.keys(CONNECTION_STAGES)).toHaveLength(8);
    });

    it('every stage has transition rules', () => {
      for (const stage of Object.values(CONNECTION_STAGES)) {
        expect(STAGE_TRANSITIONS[stage]).toBeDefined();
        expect(Array.isArray(STAGE_TRANSITIONS[stage])).toBe(true);
      }
    });

    it('ARCHIVED has no forward transitions', () => {
      expect(STAGE_TRANSITIONS[CONNECTION_STAGES.ARCHIVED]).toEqual([]);
    });
  });

  describe('COMFORT_REVEAL_THRESHOLD', () => {
    it('is a positive number', () => {
      expect(COMFORT_REVEAL_THRESHOLD).toBeGreaterThan(0);
      expect(COMFORT_REVEAL_THRESHOLD).toBeLessThanOrEqual(100);
    });
  });

  describe('GAME_TYPES', () => {
    it('has 7 game types', () => {
      expect(Object.keys(GAME_TYPES)).toHaveLength(7);
    });
  });

  describe('MATCH_TIERS', () => {
    it('tiers cover the full score range without overlap', () => {
      const tiers = Object.values(MATCH_TIERS).sort((a, b) => a.min - b.min);
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].min).toBe(tiers[i - 1].max + 1);
      }
    });
  });
});
