const Joi = require('joi');
const { GAME_TYPES } = require('../utils/constants');

// ─── Validation Schemas ─────────────────────────────────────────

const createGameSchema = Joi.object({
  matchId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid match ID format',
      'any.required': 'matchId is required',
    }),
  gameType: Joi.string()
    .valid(...Object.values(GAME_TYPES))
    .required()
    .messages({
      'any.only': `gameType must be one of: ${Object.values(GAME_TYPES).join(', ')}`,
      'any.required': 'gameType is required',
    }),
});

const submitResponseSchema = Joi.object({
  answer: Joi.string()
    .trim()
    .min(1)
    .max(1000)
    .required()
    .messages({
      'string.empty': 'Answer is required',
      'string.max': 'Answer must be 1000 characters or less',
      'any.required': 'Answer is required',
    }),
});

const readyGameSchema = Joi.object({
  ready: Joi.boolean().required().messages({
    'any.required': 'ready is required',
  }),
});

const gameIdParamSchema = Joi.object({
  gameId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid game ID format',
    }),
});

const matchIdParamSchema = Joi.object({
  matchId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid match ID format',
    }),
});

// ─── Validate Middleware Factory ────────────────────────────────

/**
 * Creates middleware that validates req.body against a Joi schema.
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        errors,
      });
    }

    req.body = value;
    next();
  };
};

/**
 * Validates req.params against a Joi schema.
 */
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        errors,
      });
    }

    req.params = value;
    next();
  };
};

module.exports = {
  createGameSchema,
  submitResponseSchema,
  readyGameSchema,
  gameIdParamSchema,
  matchIdParamSchema,
  validate,
  validateParams,
};
