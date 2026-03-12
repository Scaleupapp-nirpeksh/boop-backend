const Joi = require('joi');

/**
 * Schema for submitting an answer to a question
 */
const submitAnswerSchema = Joi.object({
  questionNumber: Joi.number()
    .integer()
    .min(1)
    .max(200)
    .required()
    .messages({
      'number.base': 'Question number must be a number',
      'number.min': 'Question number must be between 1 and 200',
      'number.max': 'Question number must be between 1 and 200',
      'any.required': 'Question number is required',
    }),

  textAnswer: Joi.string()
    .trim()
    .max(500)
    .optional()
    .messages({
      'string.max': 'Answer cannot exceed 500 characters',
    }),

  selectedOption: Joi.string()
    .trim()
    .optional(),

  selectedOptions: Joi.array()
    .items(Joi.string().trim())
    .optional(),

  followUpAnswer: Joi.string()
    .trim()
    .max(300)
    .optional()
    .messages({
      'string.max': 'Follow-up answer cannot exceed 300 characters',
    }),

  timeSpent: Joi.number()
    .integer()
    .min(0)
    .max(3600)
    .optional()
    .messages({
      'number.max': 'Time spent cannot exceed 3600 seconds',
    }),
});

/**
 * Middleware factory: validates req.body against the given Joi schema
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
  submitAnswerSchema,
  validate,
};
