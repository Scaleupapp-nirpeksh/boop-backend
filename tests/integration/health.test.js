const request = require('supertest');

// Mock OpenAI SDK (loaded transitively via transcription.service → profile.service → app)
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: { create: jest.fn() },
    audio: { transcriptions: { create: jest.fn() } },
    chat: { completions: { create: jest.fn() } },
  }));
});

// Mock mongoose to avoid actual DB connection
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connection: { readyState: 1 },
    connect: jest.fn().mockResolvedValue(true),
  };
});

// Mock firebase-admin to avoid initialization errors
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  auth: jest.fn(() => ({ verifyIdToken: jest.fn() })),
  messaging: jest.fn(() => ({ send: jest.fn() })),
}));

const app = require('../../src/app');

describe('Health Check', () => {
  it('GET /api/v1/health returns 200 with status ok', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.mongodb).toBe('connected');
    expect(res.body.data).toHaveProperty('uptime');
    expect(res.body.data).toHaveProperty('timestamp');
  });

  it('returns environment info', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.body.data).toHaveProperty('environment');
    expect(res.body.data).toHaveProperty('version');
  });
});

describe('404 Handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
