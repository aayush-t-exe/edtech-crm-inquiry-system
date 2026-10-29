import bcrypt from 'bcrypt';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError } from '../lib/http-error.js';
import { signAdminToken, verifyAdminToken } from '../lib/tokens.js';
import { fieldErrors, loginSchema } from '../lib/validation.js';
import { readToken, requireAdmin } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rate-limit.js';

export const authRouter = Router();

const cookieOptions = {
  httpOnly: true, // page JavaScript can't read it
  secure: config.isProd, // HTTPS only in production
  sameSite: 'lax', // not sent on cross-site POSTs (CSRF protection)
  path: '/api',
};

// When the email doesn't exist we still run one bcrypt comparison against this hash,
// so the response time doesn't reveal which emails are registered.
let dummyHash;

authRouter.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, 'Check the highlighted fields.', fieldErrors(parsed.error));
  const { email, password } = parsed.data;

  const { rows } = await query('select id, email, name, password_hash from admins where lower(email) = $1', [email]);
  const admin = rows[0];

  dummyHash ??= await bcrypt.hash('timing-equaliser', 12);
  const ok = await bcrypt.compare(password, admin?.password_hash ?? dummyHash);
  // Same message for "no such email" and "wrong password" (no account enumeration).
  if (!admin || !ok) throw new HttpError(401, 'Incorrect email or password.');

  await query('update admins set last_login_at = now() where id = $1', [admin.id]);

  const token = signAdminToken(admin);
  const { exp } = jwt.decode(token);
  const expiresAt = new Date(exp * 1000);

  res.cookie(config.cookieName, token, { ...cookieOptions, expires: expiresAt });
  res.json({
    token, // for API clients that prefer the Authorization header
    tokenType: 'Bearer',
    expiresAt: expiresAt.toISOString(),
    admin: { id: admin.id, email: admin.email, name: admin.name },
  });
});

// Logout revokes this exact token (by its jti) so it can't be reused even if it was copied,
// then clears the cookie. Other sessions of the same admin stay logged in.
authRouter.post('/logout', async (req, res) => {
  const token = readToken(req);
  if (token) {
    try {
      const { jti, sub, exp } = verifyAdminToken(token);
      await query(
        `insert into revoked_tokens (jti, admin_id, expires_at) values ($1, $2, to_timestamp($3))
         on conflict (jti) do nothing`,
        [jti, sub, exp],
      );
      // Housekeeping: expired tokens are rejected anyway, so their rows are no longer needed.
      await query('delete from revoked_tokens where expires_at < now()');
    } catch {
      // Invalid or expired token: nothing to revoke.
    }
  }
  res.clearCookie(config.cookieName, cookieOptions);
  res.status(204).end();
});

authRouter.get('/me', requireAdmin, (req, res) => {
  res.json({ admin: req.admin });
});
