// Mock OpenAI SDK before requiring the service (SDK throws without API key)
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: {
      create: jest.fn().mockResolvedValue({ data: [] }),
    },
  }));
});

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

const EmbeddingService = require('../../src/services/embedding.service');

describe('EmbeddingService', () => {
  describe('cosineSimilarity', () => {
    it('returns 0 for null inputs', () => {
      expect(EmbeddingService.cosineSimilarity(null, null)).toBe(0);
      expect(EmbeddingService.cosineSimilarity([1, 2], null)).toBe(0);
      expect(EmbeddingService.cosineSimilarity(null, [1, 2])).toBe(0);
    });

    it('returns 0 for mismatched dimensions', () => {
      expect(EmbeddingService.cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });

    it('returns 1 for identical vectors', () => {
      const vec = [0.5, 0.3, 0.8, 0.1];
      const score = EmbeddingService.cosineSimilarity(vec, vec);
      expect(score).toBeCloseTo(1.0, 2);
    });

    it('returns ~0.5 for orthogonal vectors', () => {
      const score = EmbeddingService.cosineSimilarity([1, 0], [0, 1]);
      expect(score).toBeCloseTo(0.5, 2);
    });

    it('returns ~0 for opposite vectors', () => {
      const score = EmbeddingService.cosineSimilarity([1, 0], [-1, 0]);
      expect(score).toBeCloseTo(0, 2);
    });

    it('returns value between 0 and 1 for typical vectors', () => {
      const a = [0.1, 0.5, 0.3, 0.7, 0.2];
      const b = [0.2, 0.4, 0.6, 0.5, 0.3];
      const score = EmbeddingService.cosineSimilarity(a, b);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('returns 0 for zero-magnitude vectors', () => {
      expect(EmbeddingService.cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    });

    it('is symmetric (a,b) === (b,a)', () => {
      const a = [0.3, 0.7, 0.1];
      const b = [0.5, 0.2, 0.9];
      expect(EmbeddingService.cosineSimilarity(a, b))
        .toBeCloseTo(EmbeddingService.cosineSimilarity(b, a), 10);
    });
  });

  describe('generateEmbedding', () => {
    it('returns null for empty text', async () => {
      expect(await EmbeddingService.generateEmbedding('')).toBeNull();
      expect(await EmbeddingService.generateEmbedding(null)).toBeNull();
    });

    it('returns null for whitespace-only text', async () => {
      expect(await EmbeddingService.generateEmbedding('   ')).toBeNull();
    });
  });

  describe('batchGenerateEmbeddings', () => {
    it('returns all nulls for empty texts', async () => {
      const result = await EmbeddingService.batchGenerateEmbeddings(['', null, '  ']);
      expect(result).toEqual([null, null, null]);
    });
  });
});
