const Joi = require('joi');

/**
 * Schema for updating basic profile info (Steps 1–5 of profile setup).
 * All fields are sent together as a single batch.
 */
const updateBasicInfoSchema = Joi.object({
  firstName: Joi.string()
    .trim()
    .min(1)
    .max(50)
    .optional()
    .messages({
      'string.empty': 'First name is required',
      'string.max': 'First name cannot exceed 50 characters',
    }),

  dateOfBirth: Joi.date()
    .iso()
    .max('now')
    .optional()
    .messages({
      'date.base': 'Date of birth must be a valid date',
      'date.max': 'Date of birth cannot be in the future',
    }),

  gender: Joi.string()
    .valid('male', 'female', 'non-binary', 'other')
    .optional()
    .messages({
      'any.only': 'Gender must be one of: male, female, non-binary, other',
    }),

  interestedIn: Joi.string()
    .valid('men', 'women', 'everyone')
    .optional()
    .messages({
      'any.only': 'Interested in must be one of: men, women, everyone',
    }),

  bio: Joi.string()
    .trim()
    .max(500)
    .allow('')
    .optional()
    .messages({
      'string.max': 'Bio cannot exceed 500 characters',
    }),

  location: Joi.object({
    city: Joi.string().trim().max(100).optional(),
    coordinates: Joi.array()
      .items(Joi.number())
      .length(2)
      .optional()
      .messages({
        'array.length': 'Coordinates must be [longitude, latitude]',
      }),
  }).optional(),
});

const reorderPhotosSchema = Joi.object({
  orderedPhotoIds: Joi.array()
    .items(Joi.string().trim().min(1))
    .min(1)
    .required()
    .messages({
      'array.base': 'orderedPhotoIds must be an array',
      'array.min': 'At least one photo id is required',
      'any.required': 'orderedPhotoIds is required',
    }),

  mainPhotoId: Joi.string()
    .trim()
    .min(1)
    .optional()
    .messages({
      'string.empty': 'mainPhotoId cannot be empty',
    }),
});

const notificationPreferencesSchema = Joi.object({
  allMuted: Joi.boolean().optional(),
  quietHoursStart: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .allow('', null)
    .optional()
    .messages({
      'string.pattern.base': 'quietHoursStart must be in HH:mm format',
    }),
  quietHoursEnd: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .allow('', null)
    .optional()
    .messages({
      'string.pattern.base': 'quietHoursEnd must be in HH:mm format',
    }),
  timezone: Joi.string().trim().max(100).optional(),
});

/**
 * Middleware factory: validates req.body against the given Joi schema
 * @param {Joi.ObjectSchema} schema - Joi validation schema
 * @returns {function} Express middleware
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
  updateBasicInfoSchema,
  reorderPhotosSchema,
  notificationPreferencesSchema,
  validate,
};
