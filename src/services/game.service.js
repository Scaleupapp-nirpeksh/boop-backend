const Game = require('../models/Game');
const Match = require('../models/Match');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { GAME_TYPES, CONNECTION_STAGES } = require('../utils/constants');
const {
  WOULD_YOU_RATHER,
  TWO_TRUTHS_A_LIE_PROMPTS,
  NEVER_HAVE_I_EVER,
  WHAT_WOULD_YOU_DO,
  INTIMACY_SPECTRUM,
  DREAM_BOARD,
  BLIND_REVEAL,
  selectRandom,
} = require('../scripts/gameContent');
const logger = require('../utils/logger');

class GameService {
  static roundTimers = new Map();

  static async createGame(userId, matchId, gameType) {
    const validTypes = Object.values(GAME_TYPES);
    if (!validTypes.includes(gameType)) {
      const error = new Error(
        `Invalid game type "${gameType}". Supported: ${validTypes.join(', ')}`
      );
      error.statusCode = 400;
      throw error;
    }

    const match = await Match.findOne({
      _id: matchId,
      users: userId,
      isActive: true,
    });

    if (!match) {
      const error = new Error('Match not found');
      error.statusCode = 404;
      throw error;
    }

    const activeStages = [
      CONNECTION_STAGES.CONNECTING,
      CONNECTION_STAGES.REVEAL_READY,
      CONNECTION_STAGES.REVEALED,
      CONNECTION_STAGES.DATING,
    ];

    if (!activeStages.includes(match.stage)) {
      const error = new Error(
        'You need to start chatting before playing games. Send a message first!'
      );
      error.statusCode = 400;
      throw error;
    }

    const existingGame = await Game.findOne({
      matchId,
      gameType,
      status: { $in: ['pending', 'active'] },
    });

    if (existingGame) {
      const error = new Error(
        `There's already an active ${gameType} game for this match`
      );
      error.statusCode = 409;
      throw error;
    }

    const conversation = await Conversation.findOne({ matchId });
    if (!conversation) {
      const error = new Error('Conversation not found for this match');
      error.statusCode = 404;
      throw error;
    }

    const totalRounds = 5;
    const rounds = GameService._buildRounds(gameType, totalRounds);
    const participants = [...match.users];
    const now = new Date();

    const game = await Game.create({
      matchId,
      conversationId: conversation._id,
      gameType,
      status: 'pending',
      createdBy: userId,
      participants,
      rounds,
      currentRound: 0,
      totalRounds,
      syncState: {
        readyPlayers: participants.map((participantId) => ({
          userId: participantId,
          isReady: false,
          readyAt: null,
        })),
        countdownSeconds: 3,
        roundDurationSeconds: GameService._roundDurationForGame(gameType),
        lastTransitionAt: now,
        replayAvailableAt: new Date(now.getTime() + GameService._replayCooldownMs(gameType)),
      },
    });

    try {
      const gameInviteMessage = await Message.create({
        conversationId: conversation._id,
        senderId: userId,
        type: 'game_invite',
        content: {
          text: GameService._getGameInviteText(gameType),
          gameType,
          gameSessionId: game._id,
        },
      });

      await conversation.updateLastMessage(gameInviteMessage);
    } catch (err) {
      logger.error('Error sending game invite message:', err.message);
    }

    logger.info(
      `Live game created: ${gameType} for match ${matchId} by user ${userId} (gameId: ${game._id})`
    );

    const populated = await Game.findById(game._id)
      .populate('participants', 'firstName')
      .populate('createdBy', 'firstName');

    return this._formatGame(populated, userId);
  }

  static async getGame(userId, gameId) {
    let game = await Game.findOne({
      _id: gameId,
      participants: userId,
    })
      .populate('participants', 'firstName')
      .populate('createdBy', 'firstName');

    if (!game) {
      const error = new Error('Game not found');
      error.statusCode = 404;
      throw error;
    }

    game = await this._materializeGameState(game);
    return this._formatGame(game, userId);
  }

  static async setReadyState(userId, gameId, ready) {
    let game = await Game.findOne({
      _id: gameId,
      participants: userId,
    })
      .populate('participants', 'firstName')
      .populate('createdBy', 'firstName');

    if (!game) {
      const error = new Error('Game not found');
      error.statusCode = 404;
      throw error;
    }

    if (game.status === 'completed' || game.status === 'cancelled') {
      const error = new Error('This game can no longer be updated');
      error.statusCode = 400;
      throw error;
    }

    this._ensureSyncState(game);
    const readyPlayer = game.syncState.readyPlayers.find(
      (player) => player.userId.toString() === userId.toString()
    );

    if (!readyPlayer) {
      const error = new Error('Participant not found');
      error.statusCode = 400;
      throw error;
    }

    readyPlayer.isReady = ready;
    readyPlayer.readyAt = ready ? new Date() : null;
    game.syncState.lastTransitionAt = new Date();

    if (!ready && game.status === 'pending') {
      game.syncState.countdownStartedAt = null;
      game.syncState.countdownEndsAt = null;
      game.syncState.roundStartedAt = null;
      game.syncState.roundEndsAt = null;
    }

    if (
      game.status === 'pending' &&
      game.syncState.readyPlayers.length === 2 &&
      game.syncState.readyPlayers.every((player) => player.isReady)
    ) {
      this._beginCountdownForCurrentRound(game, new Date());
    }

    await game.save();
    this._scheduleRoundTimeout(game);

    return this._formatGame(game, userId);
  }

  static async submitResponse(userId, gameId, answer) {
    let game = await Game.findOne({
      _id: gameId,
      participants: userId,
    })
      .populate('participants', 'firstName')
      .populate('createdBy', 'firstName');

    if (!game) {
      const error = new Error('Game not found');
      error.statusCode = 404;
      throw error;
    }

    game = await this._materializeGameState(game);

    if (game.status === 'completed') {
      const error = new Error('This game has already been completed');
      error.statusCode = 400;
      throw error;
    }

    if (game.status === 'cancelled') {
      const error = new Error('This game has been cancelled');
      error.statusCode = 400;
      throw error;
    }

    if (game.status !== 'active') {
      const error = new Error('Both players need to be ready before the game starts');
      error.statusCode = 400;
      throw error;
    }

    const now = new Date();
    if (game.syncState?.countdownEndsAt && now < new Date(game.syncState.countdownEndsAt)) {
      const error = new Error('The countdown is still running');
      error.statusCode = 400;
      throw error;
    }

    if (game.syncState?.roundEndsAt && now > new Date(game.syncState.roundEndsAt)) {
      game = await this._materializeGameState(game, { forceTimeoutEvaluation: true });
      const error = new Error('That round already timed out. Reload the game state.');
      error.statusCode = 409;
      throw error;
    }

    const currentRoundIndex = game.currentRound;
    if (currentRoundIndex >= game.rounds.length) {
      const error = new Error('All rounds have been completed');
      error.statusCode = 400;
      throw error;
    }

    const round = game.rounds[currentRoundIndex];
    const alreadyAnswered = round.responses.some(
      (response) => response.userId.toString() === userId.toString()
    );

    if (alreadyAnswered) {
      const error = new Error('You have already answered this round');
      error.statusCode = 400;
      throw error;
    }

    GameService._validateAnswer(game.gameType, round.prompt, answer);

    round.responses.push({
      userId,
      answer: answer.trim(),
      answeredAt: now,
    });

    let roundComplete = false;
    let gameComplete = false;

    if (round.responses.length === 2) {
      round.isComplete = true;
      roundComplete = true;

      if (currentRoundIndex + 1 >= game.totalRounds) {
        this._completeGame(game, now);
        gameComplete = true;
      } else {
        game.currentRound = currentRoundIndex + 1;
        this._beginCountdownForCurrentRound(game, now);
      }
    }

    await game.save();
    this._scheduleRoundTimeout(game);

    if (gameComplete) {
      try {
        const conversation = await Conversation.findById(game.conversationId);
        if (conversation) {
          const sysMsg = await Message.create({
            conversationId: game.conversationId,
            senderId: userId,
            type: 'system',
            content: {
              text: `Game completed! You played ${game.totalRounds} rounds of ${game.gameType.replace(/_/g, ' ')}.`,
            },
          });

          await conversation.updateLastMessage(sysMsg);
        }
      } catch (_) {
        // Non-critical
      }
    }

    return {
      gameId: game._id,
      gameType: game.gameType,
      status: game.status,
      currentRound: game.currentRound,
      totalRounds: game.totalRounds,
      roundComplete,
      gameComplete,
      round: {
        roundNumber: round.roundNumber,
        prompt: round.prompt,
        responses: roundComplete ? round.responses : undefined,
        isComplete: round.isComplete,
      },
      completedAt: game.completedAt,
      sessionPhase: this._sessionPhaseForGame(game),
      sync: this._formatSyncState(game, userId),
    };
  }

  static async getGamesForMatch(userId, matchId) {
    const match = await Match.findOne({
      _id: matchId,
      users: userId,
    });

    if (!match) {
      const error = new Error('Match not found');
      error.statusCode = 404;
      throw error;
    }

    const games = await Game.find({ matchId })
      .populate('createdBy', 'firstName')
      .populate('participants', 'firstName')
      .sort({ createdAt: -1 });

    const hydrated = [];
    for (const game of games) {
      hydrated.push(await this._materializeGameState(game));
    }

    return hydrated.map((game) => ({
      gameId: game._id,
      gameType: game.gameType,
      status: game.status,
      totalRounds: game.totalRounds,
      currentRound: game.currentRound,
      createdBy: game.createdBy,
      completedAt: game.completedAt,
      createdAt: game.createdAt,
      sessionPhase: this._sessionPhaseForGame(game),
      sync: this._formatSyncState(game, userId),
    }));
  }

  static async cancelGame(userId, gameId) {
    const game = await Game.findOne({
      _id: gameId,
      participants: userId,
    });

    if (!game) {
      const error = new Error('Game not found');
      error.statusCode = 404;
      throw error;
    }

    if (game.status === 'completed') {
      const error = new Error('Cannot cancel a completed game');
      error.statusCode = 400;
      throw error;
    }

    if (game.status === 'cancelled') {
      const error = new Error('Game is already cancelled');
      error.statusCode = 400;
      throw error;
    }

    this._clearTimers(game._id);
    game.status = 'cancelled';
    game.syncState.lastTransitionAt = new Date();
    game.syncState.countdownStartedAt = null;
    game.syncState.countdownEndsAt = null;
    game.syncState.roundStartedAt = null;
    game.syncState.roundEndsAt = null;
    await game.save();

    logger.info(`Game ${gameId} cancelled by user ${userId}`);

    return {
      gameId: game._id,
      gameType: game.gameType,
      status: game.status,
      sessionPhase: this._sessionPhaseForGame(game),
      sync: this._formatSyncState(game, userId),
    };
  }

  static async _materializeGameState(game, options = {}) {
    this._ensureSyncState(game);

    const now = new Date();
    let changed = false;

    if (
      game.status === 'active' &&
      game.syncState?.roundEndsAt &&
      now >= new Date(game.syncState.roundEndsAt)
    ) {
      changed = await this._handleRoundTimeout(game, now) || changed;
    }

    if (changed) {
      await game.save();
    }

    this._scheduleRoundTimeout(game);

    if (options.forceTimeoutEvaluation) {
      return game;
    }

    return game;
  }

  static async _handleRoundTimeout(game, at = new Date()) {
    if (game.status !== 'active') return false;

    const currentRound = game.rounds[game.currentRound];
    if (!currentRound || currentRound.isComplete) return false;

    const participantIds = (game.participants || []).map((participant) =>
      participant._id ? participant._id.toString() : participant.toString()
    );
    const answeredIds = new Set(
      (currentRound.responses || []).map((response) => response.userId.toString())
    );

    participantIds.forEach((participantId) => {
      if (!answeredIds.has(participantId)) {
        currentRound.responses.push({
          userId: participantId,
          answer: 'Timed out',
          answeredAt: at,
        });
      }
    });

    currentRound.isComplete = true;

    if (game.currentRound + 1 >= game.totalRounds) {
      this._completeGame(game, at);
    } else {
      game.currentRound = game.currentRound + 1;
      this._beginCountdownForCurrentRound(game, at);
    }

    return true;
  }

  static _ensureSyncState(game) {
    if (!game.syncState) game.syncState = {};
    if (!Array.isArray(game.syncState.readyPlayers) || game.syncState.readyPlayers.length === 0) {
      game.syncState.readyPlayers = (game.participants || []).map((participant) => ({
        userId: participant._id || participant,
        isReady: false,
        readyAt: null,
      }));
    }

    if (!game.syncState.countdownSeconds) game.syncState.countdownSeconds = 3;
    if (!game.syncState.roundDurationSeconds) {
      game.syncState.roundDurationSeconds = this._roundDurationForGame(game.gameType);
    }
  }

  static _beginCountdownForCurrentRound(game, at = new Date()) {
    this._ensureSyncState(game);

    game.status = 'active';
    game.syncState.lastTransitionAt = at;
    game.syncState.countdownStartedAt = at;
    game.syncState.countdownEndsAt = new Date(
      at.getTime() + game.syncState.countdownSeconds * 1000
    );
    game.syncState.roundStartedAt = new Date(game.syncState.countdownEndsAt);
    game.syncState.roundEndsAt = new Date(
      game.syncState.roundStartedAt.getTime() +
        game.syncState.roundDurationSeconds * 1000
    );
  }

  static _completeGame(game, at = new Date()) {
    this._clearTimers(game._id);
    game.status = 'completed';
    game.completedAt = at;
    game.syncState.lastTransitionAt = at;
    game.syncState.countdownStartedAt = null;
    game.syncState.countdownEndsAt = null;
    game.syncState.roundStartedAt = null;
    game.syncState.roundEndsAt = null;
    game.syncState.replayAvailableAt = new Date(
      at.getTime() + this._replayCooldownMs(game.gameType)
    );
  }

  static _scheduleRoundTimeout(game) {
    this._clearTimers(game._id);

    if (
      game.status !== 'active' ||
      !game.syncState?.roundEndsAt ||
      !game.conversationId
    ) {
      return;
    }

    const delay = new Date(game.syncState.roundEndsAt).getTime() - Date.now();
    if (delay <= 0) return;

    const timer = setTimeout(async () => {
      try {
        let liveGame = await Game.findById(game._id)
          .populate('participants', 'firstName')
          .populate('createdBy', 'firstName');

        if (!liveGame) return;
        liveGame = await this._materializeGameState(liveGame, { forceTimeoutEvaluation: true });
        await liveGame.save();

        const socketManager = require('../config/socket');
        socketManager.emitToConversation(
          liveGame.conversationId.toString(),
          'game:state_changed',
          this._formatGame(liveGame, null)
        );
      } catch (error) {
        logger.error(`Game timeout scheduler failed for ${game._id}: ${error.message}`);
      } finally {
        this.roundTimers.delete(game._id.toString());
      }
    }, delay);

    this.roundTimers.set(game._id.toString(), timer);
  }

  static _clearTimers(gameId) {
    const key = gameId.toString();
    if (this.roundTimers.has(key)) {
      clearTimeout(this.roundTimers.get(key));
      this.roundTimers.delete(key);
    }
  }

  static _formatGame(game, userId = null) {
    const currentUserId = userId?.toString?.() || null;

    return {
      gameId: game._id,
      gameType: game.gameType,
      status: game.status,
      totalRounds: game.totalRounds,
      currentRound: game.currentRound,
      rounds: GameService._sanitizeRounds(game.rounds, game.currentRound, currentUserId),
      participants: game.participants,
      createdBy: game.createdBy,
      completedAt: game.completedAt,
      createdAt: game.createdAt,
      sessionPhase: this._sessionPhaseForGame(game),
      sync: this._formatSyncState(game, currentUserId),
    };
  }

  static _formatSyncState(game, userId = null) {
    this._ensureSyncState(game);

    const playerNameById = new Map(
      (game.participants || []).map((participant) => [
        participant._id ? participant._id.toString() : participant.toString(),
        participant.firstName || 'Someone',
      ])
    );

    const readyPlayers = (game.syncState.readyPlayers || []).map((player) => {
      const id = player.userId._id ? player.userId._id.toString() : player.userId.toString();
      return {
        userId: id,
        firstName: playerNameById.get(id) || 'Someone',
        isReady: !!player.isReady,
        readyAt: player.readyAt || null,
      };
    });

    const myReady = userId
      ? readyPlayers.find((player) => player.userId === userId)?.isReady || false
      : false;

    return {
      serverNow: new Date(),
      countdownSeconds: game.syncState.countdownSeconds,
      roundDurationSeconds: game.syncState.roundDurationSeconds,
      countdownStartedAt: game.syncState.countdownStartedAt || null,
      countdownEndsAt: game.syncState.countdownEndsAt || null,
      roundStartedAt: game.syncState.roundStartedAt || null,
      roundEndsAt: game.syncState.roundEndsAt || null,
      replayAvailableAt: game.syncState.replayAvailableAt || null,
      readyPlayers,
      myReady,
      allReady: readyPlayers.length > 0 && readyPlayers.every((player) => player.isReady),
      waitingForUserNames: readyPlayers
        .filter((player) => !player.isReady)
        .map((player) => player.firstName),
    };
  }

  static _sessionPhaseForGame(game) {
    if (game.status === 'cancelled') return 'cancelled';
    if (game.status === 'completed') return 'completed';
    if (game.status === 'pending') return 'waiting_room';

    const now = Date.now();
    const countdownEndsAt = game.syncState?.countdownEndsAt
      ? new Date(game.syncState.countdownEndsAt).getTime()
      : null;
    const roundEndsAt = game.syncState?.roundEndsAt
      ? new Date(game.syncState.roundEndsAt).getTime()
      : null;

    if (countdownEndsAt && now < countdownEndsAt) return 'countdown';
    if (roundEndsAt && now < roundEndsAt) return 'live_round';
    return 'transitioning';
  }

  static _roundDurationForGame(gameType) {
    switch (gameType) {
      case GAME_TYPES.WOULD_YOU_RATHER:
      case GAME_TYPES.NEVER_HAVE_I_EVER:
      case GAME_TYPES.INTIMACY_SPECTRUM:
        return 30;
      case GAME_TYPES.TWO_TRUTHS_A_LIE:
      case GAME_TYPES.WHAT_WOULD_YOU_DO:
      case GAME_TYPES.DREAM_BOARD:
      case GAME_TYPES.BLIND_REVEAL:
      default:
        return 60;
    }
  }

  static _replayCooldownMs(gameType) {
    switch (gameType) {
      case GAME_TYPES.INTIMACY_SPECTRUM:
      case GAME_TYPES.BLIND_REVEAL:
        return 6 * 60 * 60 * 1000;
      default:
        return 60 * 60 * 1000;
    }
  }

  static _buildRounds(gameType, totalRounds) {
    switch (gameType) {
      case GAME_TYPES.WOULD_YOU_RATHER: {
        const selected = selectRandom(WOULD_YOU_RATHER, totalRounds);
        return selected.map((item, i) => ({
          roundNumber: i + 1,
          prompt: {
            text: 'Would you rather...',
            optionA: item.optionA,
            optionB: item.optionB,
            category: null,
          },
          responses: [],
          isComplete: false,
        }));
      }
      case GAME_TYPES.TWO_TRUTHS_A_LIE: {
        const selected = selectRandom(TWO_TRUTHS_A_LIE_PROMPTS, totalRounds);
        return selected.map((promptText, i) => ({
          roundNumber: i + 1,
          prompt: {
            text: promptText,
            optionA: null,
            optionB: null,
            category: null,
          },
          responses: [],
          isComplete: false,
        }));
      }
      case GAME_TYPES.NEVER_HAVE_I_EVER: {
        const selected = selectRandom(NEVER_HAVE_I_EVER, totalRounds);
        return selected.map((item, i) => ({
          roundNumber: i + 1,
          prompt: {
            text: item.text,
            optionA: 'I have',
            optionB: 'Never',
            category: item.category,
          },
          responses: [],
          isComplete: false,
        }));
      }
      case GAME_TYPES.WHAT_WOULD_YOU_DO: {
        const selected = selectRandom(WHAT_WOULD_YOU_DO, totalRounds);
        return selected.map((item, i) => ({
          roundNumber: i + 1,
          prompt: {
            text: item.scenario,
            context: item.context,
          },
          responses: [],
          isComplete: false,
        }));
      }
      case GAME_TYPES.INTIMACY_SPECTRUM: {
        const selected = selectRandom(INTIMACY_SPECTRUM, totalRounds);
        return selected.map((item, i) => ({
          roundNumber: i + 1,
          prompt: {
            text: item.text,
            category: item.category,
            scale: { min: 1, max: 10 },
          },
          responses: [],
          isComplete: false,
        }));
      }
      case GAME_TYPES.DREAM_BOARD: {
        const selected = selectRandom(DREAM_BOARD, totalRounds);
        return selected.map((item, i) => ({
          roundNumber: i + 1,
          prompt: {
            text: item.text,
            category: item.category,
          },
          responses: [],
          isComplete: false,
        }));
      }
      case GAME_TYPES.BLIND_REVEAL: {
        const selected = selectRandom(BLIND_REVEAL, totalRounds);
        return selected.map((item, i) => ({
          roundNumber: i + 1,
          prompt: {
            text: item.text,
            revealPrompt: item.revealPrompt,
          },
          responses: [],
          isComplete: false,
        }));
      }
      default: {
        const error = new Error(`Cannot build rounds for game type: ${gameType}`);
        error.statusCode = 400;
        throw error;
      }
    }
  }

  static _validateAnswer(gameType, prompt, answer) {
    if (!answer || answer.trim().length === 0) {
      const error = new Error('Answer is required');
      error.statusCode = 400;
      throw error;
    }

    if (answer.length > 1000) {
      const error = new Error('Answer must be 1000 characters or less');
      error.statusCode = 400;
      throw error;
    }

    if (gameType === GAME_TYPES.WOULD_YOU_RATHER) {
      const validAnswers = ['A', 'B', prompt.optionA, prompt.optionB];
      if (!validAnswers.includes(answer.trim())) {
        const error = new Error('Answer must be "A", "B", or one of the option texts');
        error.statusCode = 400;
        throw error;
      }
    }

    if (gameType === GAME_TYPES.NEVER_HAVE_I_EVER) {
      const validAnswers = ['I have', 'Never', 'i have', 'never'];
      if (!validAnswers.includes(answer.trim())) {
        const error = new Error('Answer must be "I have" or "Never"');
        error.statusCode = 400;
        throw error;
      }
    }

    if (gameType === GAME_TYPES.INTIMACY_SPECTRUM) {
      const num = parseInt(answer.trim(), 10);
      if (isNaN(num) || num < 1 || num > 10) {
        const error = new Error('Answer must be a number between 1 and 10');
        error.statusCode = 400;
        throw error;
      }
    }
  }

  static _sanitizeRounds(rounds, currentRound, userId) {
    const normalizedUserId = userId?.toString?.() || null;

    return rounds.map((round, index) => {
      const sanitized = {
        roundNumber: round.roundNumber,
        prompt: round.prompt,
        isComplete: round.isComplete,
      };

      if (round.isComplete) {
        sanitized.responses = round.responses;
      } else if (index === currentRound) {
        const myResponse = normalizedUserId
          ? round.responses?.find((response) => response.userId?.toString() === normalizedUserId)
          : null;
        sanitized.myResponse = myResponse || null;
        sanitized.otherPlayerAnswered = round.responses?.length === 1 && !myResponse;
        sanitized.waitingForOther = round.responses?.length === 1 && !!myResponse;
      }

      return sanitized;
    });
  }

  static _getGameInviteText(gameType) {
    switch (gameType) {
      case GAME_TYPES.WOULD_YOU_RATHER:
        return "Let's play Would You Rather together. Both of us need to be ready before the countdown starts.";
      case GAME_TYPES.TWO_TRUTHS_A_LIE:
        return "Let's play Two Truths & A Lie. Join live and answer each round together.";
      case GAME_TYPES.NEVER_HAVE_I_EVER:
        return "Let's play Never Have I Ever. Tap ready when you're both in.";
      case GAME_TYPES.WHAT_WOULD_YOU_DO:
        return "Let's play What Would You Do. We'll start once both of us are ready.";
      case GAME_TYPES.INTIMACY_SPECTRUM:
        return "Let's explore our Intimacy Spectrum live. Countdown starts when both players are ready.";
      case GAME_TYPES.DREAM_BOARD:
        return "Let's build a Dream Board live. Be ready before the timer starts.";
      case GAME_TYPES.BLIND_REVEAL:
        return "Let's play Blind Reveal. Both players have to enter the room before it begins.";
      default:
        return "Let's play a game live. Both players need to be ready before it starts.";
    }
  }
}

module.exports = GameService;
