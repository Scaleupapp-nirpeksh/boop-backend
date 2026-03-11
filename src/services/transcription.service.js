const OpenAI = require('openai');
const { Readable } = require('stream');
const User = require('../models/User');
const Answer = require('../models/Answer');
const logger = require('../utils/logger');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class TranscriptionService {
  /**
   * Transcribe a voice intro and save the result to the user's profile.
   * This is fire-and-forget — it runs async and doesn't block the user flow.
   *
   * @param {string} userId - User ID to update
   * @param {Buffer} audioBuffer - Raw audio buffer
   * @param {string} filename - Original filename (for extension/format hint)
   */
  static async transcribeVoiceIntro(userId, audioBuffer, filename) {
    try {
      logger.info(`Starting transcription for user ${userId}`);

      // Create a File-like object from the buffer for the OpenAI API
      const ext = filename ? filename.split('.').pop().toLowerCase() : 'm4a';
      const file = new File([audioBuffer], `voice-intro.${ext}`, {
        type: ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4',
      });

      const response = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file,
        language: 'en',
        response_format: 'text',
      });

      const transcription = typeof response === 'string' ? response.trim() : response.text?.trim();

      if (transcription) {
        await User.findByIdAndUpdate(userId, {
          'voiceIntro.transcription': transcription,
        });

        logger.info(`Transcription saved for user ${userId} (${transcription.length} chars)`);
      } else {
        logger.warn(`Empty transcription result for user ${userId}`);
      }
    } catch (error) {
      // Fire-and-forget: log but don't throw
      logger.error(`Transcription failed for user ${userId}:`, {
        error: error.message,
        code: error.code,
      });
    }
  }
  /**
   * Transcribe a voice answer and update the Answer document.
   * Fire-and-forget — runs async, doesn't block user flow.
   *
   * @param {string} answerId - Answer document ID
   * @param {Buffer} audioBuffer - Raw audio buffer
   * @param {string} filename - Original filename
   */
  static async transcribeVoiceAnswer(answerId, audioBuffer, filename) {
    try {
      logger.info(`Starting voice answer transcription for answer ${answerId}`);

      const ext = filename ? filename.split('.').pop().toLowerCase() : 'm4a';
      const file = new File([audioBuffer], `voice-answer.${ext}`, {
        type: ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4',
      });

      const response = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file,
        language: 'en',
        response_format: 'text',
      });

      const transcription = typeof response === 'string' ? response.trim() : response.text?.trim();

      if (transcription) {
        await Answer.findByIdAndUpdate(answerId, {
          textAnswer: transcription,
          transcriptionPending: false,
        });

        // Generate embedding for the transcribed text
        try {
          const EmbeddingService = require('./embedding.service');
          const embedding = await EmbeddingService.generateEmbedding(transcription);
          if (embedding) {
            await Answer.updateOne({ _id: answerId }, { $set: { embedding } });
          }
        } catch (err) {
          logger.warn('Embedding generation skipped for voice answer:', err.message);
        }

        logger.info(`Voice answer transcription saved for ${answerId} (${transcription.length} chars)`);
      } else {
        await Answer.findByIdAndUpdate(answerId, {
          textAnswer: '[Voice answer — transcription failed]',
          transcriptionPending: false,
        });
        logger.warn(`Empty transcription for answer ${answerId}`);
      }
    } catch (error) {
      logger.error(`Voice answer transcription failed for ${answerId}:`, {
        error: error.message,
        code: error.code,
      });
      await Answer.findByIdAndUpdate(answerId, {
        transcriptionPending: false,
      }).catch(() => {});
    }
  }
}

module.exports = TranscriptionService;
