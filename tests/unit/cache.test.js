// Mock Redis client
const mockClient = {
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
};

jest.mock('../../src/config/redis', () => ({
  getRedisClient: jest.fn(() => mockClient),
}));

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

const cache = require('../../src/utils/cache');
const { getRedisClient } = require('../../src/config/redis');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('cache.getOrSet', () => {
  it('returns cached value on cache hit', async () => {
    mockClient.get.mockResolvedValue(JSON.stringify({ foo: 'bar' }));

    const fetchFn = jest.fn();
    const result = await cache.getOrSet('test-key', 60, fetchFn);

    expect(result).toEqual({ foo: 'bar' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(mockClient.get).toHaveBeenCalledWith('test-key');
  });

  it('calls fetchFn and caches on cache miss', async () => {
    mockClient.get.mockResolvedValue(null);
    mockClient.setEx.mockResolvedValue('OK');

    const fetchFn = jest.fn().mockResolvedValue({ fresh: true });
    const result = await cache.getOrSet('test-key', 120, fetchFn);

    expect(result).toEqual({ fresh: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(mockClient.setEx).toHaveBeenCalledWith('test-key', 120, '{"fresh":true}');
  });

  it('falls back to fetchFn when Redis unavailable', async () => {
    getRedisClient.mockReturnValueOnce(null);

    const fetchFn = jest.fn().mockResolvedValue('fallback');
    const result = await cache.getOrSet('key', 60, fetchFn);

    expect(result).toBe('fallback');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('falls back to fetchFn on Redis GET error', async () => {
    mockClient.get.mockRejectedValue(new Error('connection refused'));

    const fetchFn = jest.fn().mockResolvedValue('fallback');
    const result = await cache.getOrSet('key', 60, fetchFn);

    expect(result).toBe('fallback');
  });

  it('still returns value if SET fails', async () => {
    mockClient.get.mockResolvedValue(null);
    mockClient.setEx.mockRejectedValue(new Error('write error'));

    const fetchFn = jest.fn().mockResolvedValue({ data: 1 });
    const result = await cache.getOrSet('key', 60, fetchFn);

    expect(result).toEqual({ data: 1 });
  });
});

describe('cache.invalidate', () => {
  it('deletes the key', async () => {
    mockClient.del.mockResolvedValue(1);
    await cache.invalidate('some-key');
    expect(mockClient.del).toHaveBeenCalledWith('some-key');
  });

  it('does nothing when Redis unavailable', async () => {
    getRedisClient.mockReturnValueOnce(null);
    await cache.invalidate('some-key');
    expect(mockClient.del).not.toHaveBeenCalled();
  });
});

describe('cache.invalidatePattern', () => {
  it('scans and deletes matching keys', async () => {
    mockClient.scan.mockResolvedValueOnce({ cursor: 0, keys: ['a:1', 'a:2'] });
    mockClient.del.mockResolvedValue(2);

    await cache.invalidatePattern('a:*');

    expect(mockClient.scan).toHaveBeenCalledWith(0, { MATCH: 'a:*', COUNT: 100 });
    expect(mockClient.del).toHaveBeenCalledWith(['a:1', 'a:2']);
  });

  it('handles multi-page SCAN', async () => {
    mockClient.scan
      .mockResolvedValueOnce({ cursor: 42, keys: ['k1'] })
      .mockResolvedValueOnce({ cursor: 0, keys: ['k2'] });
    mockClient.del.mockResolvedValue(1);

    await cache.invalidatePattern('k*');

    expect(mockClient.scan).toHaveBeenCalledTimes(2);
    expect(mockClient.del).toHaveBeenCalledTimes(2);
  });

  it('does nothing when Redis unavailable', async () => {
    getRedisClient.mockReturnValueOnce(null);
    await cache.invalidatePattern('x:*');
    expect(mockClient.scan).not.toHaveBeenCalled();
  });
});
