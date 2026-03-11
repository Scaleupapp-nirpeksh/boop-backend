const Joi = require('joi');

/**
 * Schema for sending OTP
 * Accepts E.164 format (+919876543210) or 10-digit numbers (9876543210)
 */
const sendOTPSchema = Joi.object({
  phone: Joi.string()
    .required()
    .pattern(/^(\+[1-9]\d{1,14}|\d{10})$/)
    .messages({
      'string.empty': 'Phone number is required',
      'string.pattern.base': 'Phone number must be in E.164 format (e.g., +919876543210) or a 10-digit number',
      'any.required': 'Phone number is required',
    }),
});

/**
 * Schema for verifying OTP
 */
const verifyOTPSchema = Joi.object({
  phone: Joi.string()
    .required()
    .pattern(/^(\+[1-9]\d{1,14}|\d{10})$/)
    .messages({
      'string.empty': 'Phone number is required',
      'string.pattern.base': 'Phone number must be in E.164 format (e.g., +919876543210) or a 10-digit number',
      'any.required': 'Phone number is required',
    }),
  otp: Joi.string()
    .required()
    .length(6)
    .pattern(/^\d{6}$/)
    .messages({
      'string.empty': 'OTP is required',
      'string.length': 'OTP must be exactly 6 digits',
      'string.pattern.base': 'OTP must be a 6-digit number',
      'any.required': 'OTP is required',
    }),
});

/**
 * Schema for refreshing access token
 */
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string()
    .required()
    .messages({
      'string.empty': 'Refresh token is required',
      'any.required': 'Refresh token is required',
    }),
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

    // Replace body with validated & sanitized value
    req.body = value;
    next();
  };
};

module.exports = {
  sendOTPSchema,
  verifyOTPSchema,
  refreshTokenSchema,
  validate,
};
