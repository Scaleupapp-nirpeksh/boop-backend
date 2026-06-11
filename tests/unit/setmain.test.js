const mockSend = jest.fn();
jest.mock('../../src/config/s3', () => ({ s3Client: { send: (...a) => mockSend(...a) }, S3_BUCKET: 'b', S3_BASE_URL: 'https://b.s3.amazonaws.com' }));
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));
jest.mock('sharp', () => jest.fn());
jest.mock('../../src/utils/logger', () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const UploadService = require('../../src/services/upload.service');

describe('UploadService.getObjectBuffer', () => {
  it('fetches bytes from S3 by key (not a URL)', async () => {
    async function* chunks() { yield Buffer.from('img'); }
    mockSend.mockResolvedValue({ Body: chunks() });
    const buf = await UploadService.getObjectBuffer('users/u1/gallery/x.webp');
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.toString()).toBe('img');
    expect(mockSend).toHaveBeenCalled();
  });
});
