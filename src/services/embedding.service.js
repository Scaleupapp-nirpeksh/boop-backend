const OpenAI = require('openai');
const logger = require('../utils/logger');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// MARK: - Embedding Service

/**
 * Generates text embeddings using OpenAI's text-embedding-3-small model.
 * Used for semantic similarity in compatibility scoring.
 */
class EmbeddingService {
  static MODEL = 'text-embedding-3-small';
  static DIMENSIONS = 1536;

  /**
   * Generate an embedding vector for a single text.
   * @param {string} text - Text to embed
   * @returns {number[]|null} Embedding vector or null on failure
   */
  static async generateEmbedding(text) {
    if (!text || text.trim().length === 0) return null;
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY not set — skipping embedding generation');
      return null;
    }

    try {
      const response = await openai.embeddings.create({
        model: this.MODEL,
        input: text.trim(),
      });

      return response.data[0].embedding;
    } catch (err) {
      logger.error('Embedding generation failed:', err.message);
      return null;
    }
  }

  /**
   * Generate embeddings for multiple texts in a single API call.
   * @param {string[]} texts - Array of texts to embed
   * @returns {(number[]|null)[]} Array of embedding vectors (null for failures)
   */
  static async batchGenerateEmbeddings(texts) {
    const validTexts = texts.map((t) => (t && t.trim().length > 0 ? t.trim() : null));
    const nonNullTexts = validTexts.filter(Boolean);

    if (nonNullTexts.length === 0) return texts.map(() => null);
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY not set — skipping batch embedding generation');
      return texts.map(() => null);
    }

    try {
      const response = await openai.embeddings.create({
        model: this.MODEL,
        input: nonNullTexts,
      });

      // Map results back to original positions
      const embeddings = response.data.map((d) => d.embedding);
      let embIdx = 0;
      return validTexts.map((t) => (t ? embeddings[embIdx++] : null));
    } catch (err) {
      logger.error('Batch embedding generation failed:', err.message);
      return texts.map(() => null);
    }
  }

  /**
   * Compute cosine similarity between two embedding vectors.
   * @param {number[]} embA - First embedding
   * @param {number[]} embB - Second embedding
   * @returns {number} Similarity score 0.0 to 1.0
   */
  static cosineSimilarity(embA, embB) {
    if (!embA || !embB || embA.length !== embB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < embA.length; i++) {
      dotProduct += embA[i] * embB[i];
      normA += embA[i] * embA[i];
      normB += embB[i] * embB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;

    // Cosine similarity ranges from -1 to 1; normalize to 0-1
    const similarity = dotProduct / (normA * normB);
    return Math.max(0, Math.min(1, (similarity + 1) / 2));
  }
}

module.exports = EmbeddingService;
