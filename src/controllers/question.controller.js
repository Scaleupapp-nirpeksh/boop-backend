const asyncHandler = require('../utils/asyncHandler');
const QuestionService = require('../services/question.service');
const UploadService = require('../services/upload.service');
const TranscriptionService = require('../services/transcription.service');

/**
 * @desc    Get available (unlocked + unanswered) questions for the current user
 * @route   GET /api/v1/questions
 * @access  Private
 */
const getAvailableQuestions = asyncHandler(async (req, res) => {
  const result = await QuestionService.getAvailableQuestions(req.user._id);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: `${result.questions.length} questions available`,
    data: result,
  });
});

/**
 * @desc    Submit an answer to a question
 * @route   POST /api/v1/questions/answer
 * @access  Private
 */
const submitAnswer = asyncHandler(async (req, res) => {
  const { questionNumber, ...answerData } = req.body;

  const result = await QuestionService.submitAnswer(
    req.user._id,
    questionNumber,
    answerData
  );

  res.status(201).json({
    success: true,
    statusCode: 201,
    message: `Answer submitted for question ${questionNumber}`,
    data: {
      answer: result.answer,
      questionsAnswered: result.user.questionsAnswered,
      profileStage: result.user.profileStage,
    },
  });
});

/**
 * @desc    Get the user's question-answering progress
 * @route   GET /api/v1/questions/progress
 * @access  Private
 */
const getProgress = asyncHandler(async (req, res) => {
  const progress = await QuestionService.getUserProgress(req.user._id);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Question progress retrieved',
    data: progress,
  });
});

/**
 * @desc    Submit a voice answer to a question (audio file + questionNumber)
 * @route   POST /api/v1/questions/voice-answer
 * @access  Private
 */
const submitVoiceAnswer = asyncHandler(async (req, res) => {
  const questionNumber = parseInt(req.body.questionNumber, 10);

  if (!req.file) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: 'Voice recording is required',
    });
  }

  if (!questionNumber || questionNumber < 1 || questionNumber > 60) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: 'Valid question number (1-60) is required',
    });
  }

  // Upload audio to S3
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4().slice(0, 8);
  const key = `users/${req.user._id}/answers/voice-q${questionNumber}-${id}.m4a`;
  const uploaded = await UploadService.uploadToS3(req.file.buffer, key, req.file.mimetype);

  // Submit answer with placeholder text, mark transcription pending
  const result = await QuestionService.submitAnswer(
    req.user._id,
    questionNumber,
    {
      textAnswer: '[Voice answer — transcribing...]',
      voiceAnswerUrl: uploaded.url,
      voiceAnswerS3Key: uploaded.s3Key,
      transcriptionPending: true,
    }
  );

  // Fire-and-forget: transcribe async, then update the answer
  TranscriptionService.transcribeVoiceAnswer(
    result.answer._id,
    req.file.buffer,
    req.file.originalname
  ).catch(() => {});

  res.status(201).json({
    success: true,
    statusCode: 201,
    message: `Voice answer submitted for question ${questionNumber}`,
    data: {
      answer: result.answer,
      questionsAnswered: result.user.questionsAnswered,
      profileStage: result.user.profileStage,
    },
  });
});

module.exports = {
  getAvailableQuestions,
  submitAnswer,
  submitVoiceAnswer,
  getProgress,
};
