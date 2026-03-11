const Joi = require('joi');
const { REACTION_EMOJIS } = require('../utils/constants');

// ─── Validation Schemas ─────────────────────────────────────────

const sendMessageSchema = Joi.object({
  type: Joi.string()
    .valid('text', 'voice', 'image', 'game_invite', 'system')
    .default('text'),
  text: Joi.string().max(2000).trim().allow(null, ''),
  mediaUrl: Joi.string().uri().allow(null),
  mediaDuration: Joi.number().min(0).max(300).allow(null),
  replyTo: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .allow(null),
}).custom((value, helpers) => {
  // Text is required for text messages
  if (value.type === 'text' && (!value.text || value.text.trim().length === 0)) {
    return helpers.error('any.custom', { message: 'Text content is required for text messages' });
  }
  // Media URL is required for voice/image messages
  if ((value.type === 'voice' || value.type === 'image') && !value.mediaUrl) {
    return helpers.error('any.custom', { message: `Media URL is required for ${value.type} messages` });
  }
  return value;
});

const reactionSchema = Joi.object({
  emoji: Joi.string()
    .valid(...REACTION_EMOJIS)
    .required()
    .messages({
      'any.only': `Emoji must be one of: ${REACTION_EMOJIS.join(' ')}`,
    }),
});

const conversationIdParamSchema = Joi.object({
  conversationId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid conversation ID format',
    }),
});

const messageIdParamSchema = Joi.object({
  messageId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid message ID format',
    }),
});

const paginationSchema = Joi.object({
  before: Joi.string().isoDate().allow(null),
  limit: Joi.number().integer().min(1).max(50).default(50),
  page: Joi.number().integer().min(1).default(1),
});

const uploadMediaSchema = Joi.object({
  type: Joi.string().valid('voice', 'image').required(),
  duration: Joi.number().min(0).max(300).allow(null),
});

// ─── Validate Middleware Factories ──────────────────────────────

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

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
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

    req.query = value;
    next();
  };
};

module.exports = {
  sendMessageSchema,
  reactionSchema,
  uploadMediaSchema,
  conversationIdParamSchema,
  messageIdParamSchema,
  paginationSchema,
  validate,
  validateParams,
  validateQuery,
};
