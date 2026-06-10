/**
 * Guards admin endpoints with a static API key.
 * Set ADMIN_API_KEY in the environment; requests must send it as the
 * `x-admin-key` header. Fails closed if the env var is missing.
 */
const adminAuth = (req, res, next) => {
  const configured = process.env.ADMIN_API_KEY;
  const provided = req.headers['x-admin-key'];

  if (!configured || !provided || provided !== configured) {
    return res.status(401).json({
      success: false,
      statusCode: 401,
      message: 'Unauthorized',
    });
  }

  next();
};

module.exports = { adminAuth };
