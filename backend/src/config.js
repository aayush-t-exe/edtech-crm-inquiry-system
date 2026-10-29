// Reads and checks environment variables once, so a missing secret fails loudly at startup
// instead of halfway through a request.

const isProd = process.env.NODE_ENV === 'production';

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  }
  return value.trim();
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET must be at least 32 characters. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
  );
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 4000,
  databaseUrl: required('DATABASE_URL'),
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    issuer: 'edtech-crm-api',
    audience: 'edtech-crm-admin',
  },
  cookieName: 'crm_token',
  // Comma-separated list of browser origins allowed to call the API directly (CORS).
  // Not needed when the frontend proxies /api through its own domain.
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};
