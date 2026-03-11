const { S3Client } = require('@aws-sdk/client-s3');
const logger = require('../utils/logger');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET = process.env.S3_BUCKET_NAME || 'boop-uploads';
const S3_BASE_URL = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com`;

logger.info(`S3 configured: bucket=${S3_BUCKET}, region=${process.env.AWS_REGION || 'ap-south-1'}`);

module.exports = {
  s3Client,
  S3_BUCKET,
  S3_BASE_URL,
};
