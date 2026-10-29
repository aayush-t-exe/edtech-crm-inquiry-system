import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

// Signs a short-lived access token for an admin.
// Payload is kept minimal: the admin id (sub), email and a unique token id (jti) so a
// single token can be revoked at logout. No password data, ever.
export function signAdminToken(admin) {
  return jwt.sign({ email: admin.email }, config.jwt.secret, {
    subject: admin.id,
    jwtid: randomUUID(),
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });
}

// Verifies signature, expiry, issuer and audience. Pinning the algorithm blocks
// "alg: none" and algorithm-confusion attacks. Throws if anything is off.
export function verifyAdminToken(token) {
  return jwt.verify(token, config.jwt.secret, {
    algorithms: ['HS256'],
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });
}
