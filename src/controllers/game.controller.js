const asyncHandler = require('../utils/asyncHandler');
const GameService = require('../services/game.service');

// MARK: - Game Controller

/**
 * @desc    Create a new game session
 * @route   POST /api/v1/games
 * @access  Private (requires complete profile)
 */
const createGame = asyncHandler(async (req, res) => {
  const { matchId, gameType } = req.body;

  const result = await GameService.createGame(req.user._id, matchId, gameType);

  // Emit socket event to the other participant
  try {
    const socketManager = require('../config/socket');
    const Match = require('../models/Match');
    const match = await Match.findById(matchId);
    if (match) {
      const otherUserId = match.getOtherUserId(req.user._id);
      socketManager.emitToUser(otherUserId.toString(), 'game:invite', {
        gameId: result.gameId,
        gameType: result.gameType,
        invitedBy: req.user._id,
        invitedByName: req.user.firstName,
        matchId,
      });
    }
  } catch (_) {
    // Non-critical: socket emit failure doesn't block response
  }

  // Trigger push notification for offline opponent
  try {
    const NotificationService = require('../services/notification.service');
    const socketManager = require('../config/socket');
    const Match = require('../models/Match');
    const match = await Match.findById(matchId);
    if (match) {
      const otherUserId = match.getOtherUserId(req.user._id);
      if (!socketManager.isUserOnline(otherUserId.toString())) {
        await NotificationService.notifyGameInvite(
          otherUserId,
          req.user.firstName || 'Someone',
          gameType,
          matchId
        );
      }
    }
  } catch (_) {
    // Non-critical
  }

  res.status(201).json({
    success: true,
    statusCode: 201,
    message: 'Game created',
    data: result,
  });
});

/**
 * @desc    Get a game session
 * @route   GET /api/v1/games/:gameId
 * @access  Private (requires complete profile)
 */
const getGame = asyncHandler(async (req, res) => {
  const result = await GameService.getGame(req.user._id, req.params.gameId);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Game retrieved',
    data: result,
  });
});

/**
 * @desc    Submit a response to the current game round
 * @route   POST /api/v1/games/:gameId/respond
 * @access  Private (requires complete profile)
 */
const submitResponse = asyncHandler(async (req, res) => {
  const { answer } = req.body;

  const result = await GameService.submitResponse(
    req.user._id,
    req.params.gameId,
    answer
  );

  // Emit socket event to conversation
  try {
    const Game = require('../models/Game');
    const game = await Game.findById(req.params.gameId).select('conversationId participants');
    if (game) {
      const socketManager = require('../config/socket');

      // Notify conversation room about the response
      socketManager.emitToConversation(
        game.conversationId.toString(),
        'game:response',
        {
          gameId: result.gameId,
          roundNumber: result.round.roundNumber,
          respondedBy: req.user._id,
          roundComplete: result.roundComplete,
          gameComplete: result.gameComplete,
          // Only send full round data if round is complete
          round: result.roundComplete ? result.round : undefined,
        }
      );

      socketManager.emitToConversation(
        game.conversationId.toString(),
        'game:state_changed',
        {
          gameId: result.gameId,
          status: result.status,
          currentRound: result.currentRound,
          totalRounds: result.totalRounds,
          sessionPhase: result.sessionPhase,
          sync: result.sync,
        }
      );
    }
  } catch (_) {
    // Non-critical
  }

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: result.roundComplete
      ? result.gameComplete
        ? 'Game completed!'
        : 'Round complete — next round ready'
      : 'Response recorded, waiting for the other player',
    data: result,
  });
});

/**
 * @desc    Toggle a participant's ready state for a live game
 * @route   POST /api/v1/games/:gameId/ready
 * @access  Private (requires complete profile)
 */
const setReadyState = asyncHandler(async (req, res) => {
  const { ready } = req.body;

  const result = await GameService.setReadyState(
    req.user._id,
    req.params.gameId,
    ready
  );

  try {
    const Game = require('../models/Game');
    const game = await Game.findById(req.params.gameId).select('conversationId');
    if (game) {
      const socketManager = require('../config/socket');
      socketManager.emitToConversation(
        game.conversationId.toString(),
        'game:state_changed',
        result
      );
    }
  } catch (_) {
    // Non-critical
  }

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: ready ? 'Ready state updated' : 'Ready state cleared',
    data: result,
  });
});

/**
 * @desc    Get all games for a match
 * @route   GET /api/v1/matches/:matchId/games
 * @access  Private (requires complete profile)
 */
const getGamesForMatch = asyncHandler(async (req, res) => {
  const result = await GameService.getGamesForMatch(
    req.user._id,
    req.params.matchId
  );

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: `${result.length} games found`,
    data: { games: result },
  });
});

/**
 * @desc    Cancel a game
 * @route   PATCH /api/v1/games/:gameId/cancel
 * @access  Private (requires complete profile)
 */
const cancelGame = asyncHandler(async (req, res) => {
  const result = await GameService.cancelGame(req.user._id, req.params.gameId);

  // Emit socket event
  try {
    const Game = require('../models/Game');
    const game = await Game.findById(req.params.gameId).select('conversationId');
    if (game) {
      const socketManager = require('../config/socket');
      socketManager.emitToConversation(
        game.conversationId.toString(),
        'game:cancelled',
        {
          gameId: result.gameId,
          cancelledBy: req.user._id,
        }
      );
      socketManager.emitToConversation(
        game.conversationId.toString(),
        'game:state_changed',
        result
      );
    }
  } catch (_) {
    // Non-critical
  }

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Game cancelled',
    data: result,
  });
});

module.exports = {
  createGame,
  getGame,
  setReadyState,
  submitResponse,
  getGamesForMatch,
  cancelGame,
};
