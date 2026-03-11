const logger = require('../utils/logger');

let twilioClient = null;

/**
 * Get or initialize the Twilio client (lazy-loaded)
 */
const getTwilioClient = () => {
  if (!twilioClient) {
    const twilio = require('twilio');
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return twilioClient;
};

/**
 * Send an OTP code via SMS
 * In development mode (DEV_SKIP_TWILIO=true), logs to console instead of sending SMS.
 *
 * @param {string} phone - Phone number in E.164 format
 * @param {string} code - The OTP code to send
 * @returns {Promise<void>}
 */
const sendOTP = async (phone, code) => {
  // Dev mode — skip actual SMS sending
  if (process.env.DEV_SKIP_TWILIO === 'true') {
    logger.info(`[DEV] OTP for ${phone}: ${code}`);
    console.log(`\n========================================`);
    console.log(`  OTP for ${phone}: ${code}`);
    console.log(`========================================\n`);
    return;
  }

  try {
    const client = getTwilioClient();

    await client.messages.create({
      body: `Your Boop verification code is: ${code}. This code expires in 10 minutes. Do not share this code with anyone.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });

    logger.info(`OTP sent successfully to ${phone}`);
  } catch (error) {
    logger.error(`Failed to send OTP to ${phone}:`, error);
    throw new Error('Failed to send verification code. Please try again.');
  }
};

module.exports = { sendOTP };
