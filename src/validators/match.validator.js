const Joi = require('joi');
const { CONNECTION_STAGES } = require('../utils/constants');

// ─── Validation Schemas ─────────────────────────────────────────

const matchIdParamSchema = Joi.object({
  matchId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid match ID format',
    }),
});

const archiveSchema = Joi.object({
  reason: Joi.string()
    .valid('mutual', 'one_sided', 'inactivity', 'blocked', 'other')
    .default('other'),
});

const listMatchesSchema = Joi.object({
  stage: Joi.string()
    .valid(...Object.values(CONNECTION_STAGES))
    .optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
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

/**
 * Validates req.query against a Joi schema.
 */
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
  matchIdParamSchema,
  archiveSchema,
  listMatchesSchema,
  validate,
  validateParams,
  validateQuery,
};
