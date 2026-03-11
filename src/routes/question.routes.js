const express = require('express');
const router = express.Router();
const questionController = require('../controllers/question.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { uploadVoiceAnswer } = require('../middleware/upload.middleware');
const { validate, submitAnswerSchema } = require('../validators/question.validator');

// All question routes require authentication
router.use(authenticate);

// GET /questions — Get available (unlocked + unanswered) questions
router.get('/', questionController.getAvailableQuestions);

// GET /questions/progress — Get answering progress with dimension breakdown
router.get('/progress', questionController.getProgress);

// POST /questions/answer — Submit a text/choice answer
router.post('/answer', validate(submitAnswerSchema), questionController.submitAnswer);

// POST /questions/voice-answer — Submit a voice answer (audio file)
router.post('/voice-answer', uploadVoiceAnswer, questionController.submitVoiceAnswer);

// GET /questions/history — Get all answered questions with answers
router.get('/history', questionController.getAnswerHistory);

// GET /questions/personality — Get latest personality analysis
router.get('/personality', questionController.getPersonalityAnalysis);

module.exports = router;
