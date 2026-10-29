import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

const json = (message) => ({ error: message });

// Vercel sets x-vercel-forwarded-for / x-real-ip from the real connection (clients can't
// override them there). Elsewhere we fall back to Express's req.ip.
function clientKey(req) {
  const ip = req.get('x-vercel-forwarded-for')?.split(',')[0].trim() || req.get('x-real-ip') || req.ip || 'unknown';
  return ipKeyGenerator(ip); // groups IPv6 addresses by /56 so one user can't rotate through them
}

// Note: counters live in memory, i.e. per serverless instance. Good enough to slow down
// casual abuse; a shared store (Redis/Upstash) would make the limits global.
const common = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: clientKey,
};

// Slows down password guessing. Only failed attempts count.
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: json('Too many failed login attempts. Please wait 15 minutes and try again.'),
});

// Stops one visitor (or bot) from flooding the inquiry table.
export const inquiryLimiter = rateLimit({
  ...common,
  windowMs: 10 * 60 * 1000,
  limit: 15,
  message: json('You have sent a lot of inquiries in a short time. Please wait a few minutes.'),
});
