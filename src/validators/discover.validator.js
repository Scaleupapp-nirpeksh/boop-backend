const Joi = require('joi');

// MARK: - Discover Validators

const likeSchema = Joi.object({
  targetUserId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'targetUserId must be a valid MongoDB ObjectId',
      'any.required': 'targetUserId is required',
    }),
  note: Joi.object({
    type: Joi.string().valid('text', 'voice').required(),
    content: Joi.string().max(500).optional(),
    duration: Joi.number().optional(),
  }).optional(),
});

const passSchema = Joi.object({
  targetUserId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'targetUserId must be a valid MongoDB ObjectId',
      'any.required': 'targetUserId is required',
    }),
});

/**
 * Validation middleware factory.
 * Validates req.body against the given Joi schema.
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
        message: 'Validation error',
        errors,
      });
    }

    req.body = value;
    next();
  };
};

module.exports = {
  likeSchema,
  passSchema,
  validate,
};
