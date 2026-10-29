import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError } from '../lib/http-error.js';
import { verifyAdminToken } from '../lib/tokens.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The token can arrive two ways:
//  1. "Authorization: Bearer <jwt>" header: for curl / Postman / API clients.
//  2. The httpOnly "crm_token" cookie: what the dashboard uses, so page JavaScript
//     can never read the token (protects it from XSS).
export function readToken(req) {
  const header = req.get('authorization');
  if (header) {
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token) return token;
  }
  return req.cookies?.[config.cookieName] || null;
}

// Protects every route mounted after it. Rejects with 401 unless the request carries
// a valid, unexpired, not-logged-out token for an admin who still exists in the database.
export async function requireAdmin(req, _res, next) {
  const token = readToken(req);
  if (!token) throw new HttpError(401, 'Please log in to continue.');

  let payload;
  try {
    payload = verifyAdminToken(token);
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    throw new HttpError(401, expired ? 'Your session has expired. Please log in again.' : 'Invalid session. Please log in again.');
  }
  if (!UUID.test(payload.sub ?? '') || !UUID.test(payload.jti ?? '')) {
    throw new HttpError(401, 'Invalid session. Please log in again.');
  }

  // One query: does the admin still exist, and was this exact token logged out?
  const { rows } = await query(
    `select id, email, name,
            exists (select 1 from revoked_tokens where jti = $2) as revoked
     from admins where id = $1`,
    [payload.sub, payload.jti],
  );
  if (!rows[0]) throw new HttpError(401, 'This admin account no longer exists.');
  if (rows[0].revoked) throw new HttpError(401, 'You have logged out. Please log in again.');

  const { revoked: _revoked, ...admin } = rows[0];
  req.admin = admin;
  req.token = payload;
  next();
}
