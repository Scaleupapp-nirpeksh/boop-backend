const { adminAuth } = require('../../src/middleware/adminAuth');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

afterEach(() => {
  delete process.env.ADMIN_API_KEY;
});

describe('adminAuth', () => {
  it('fails closed when ADMIN_API_KEY is not configured', () => {
    const res = mockRes();
    const next = jest.fn();
    adminAuth({ headers: { 'x-admin-key': 'anything' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a wrong key', () => {
    process.env.ADMIN_API_KEY = 'secret';
    const res = mockRes();
    const next = jest.fn();
    adminAuth({ headers: { 'x-admin-key': 'wrong' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a missing header', () => {
    process.env.ADMIN_API_KEY = 'secret';
    const res = mockRes();
    const next = jest.fn();
    adminAuth({ headers: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes with the correct key', () => {
    process.env.ADMIN_API_KEY = 'secret';
    const res = mockRes();
    const next = jest.fn();
    adminAuth({ headers: { 'x-admin-key': 'secret' } }, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
