const Joi = require('joi');
const { REPORT_REASONS } = require('../utils/constants');

const blockUserSchema = Joi.object({
  userId: Joi.string().hex().length(24).required().messages({
    'any.required': 'userId is required',
  }),
});

const reportUserSchema = Joi.object({
  userId: Joi.string().hex().length(24).required(),
  reason: Joi.string().valid(...REPORT_REASONS).required(),
  details: Joi.string().trim().max(1000).allow('', null),
  contentType: Joi.string().valid('profile', 'message', 'photo').default('profile'),
  messageId: Joi.string().hex().length(24).allow(null),
});

module.exports = { blockUserSchema, reportUserSchema };
