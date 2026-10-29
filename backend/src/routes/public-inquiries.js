import { Router } from 'express';
import { query } from '../db.js';
import { formatRef } from '../lib/constants.js';
import { HttpError } from '../lib/http-error.js';
import { fieldErrors, inquirySchema } from '../lib/validation.js';
import { inquiryLimiter } from '../middleware/rate-limit.js';

export const publicInquiriesRouter = Router();

// POST /api/inquiries: anyone can submit. Validated here AND by CHECK constraints in the database.
publicInquiriesRouter.post('/', inquiryLimiter, async (req, res) => {
  const parsed = inquirySchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, 'Check the highlighted fields.', fieldErrors(parsed.error));

  const { website, ...data } = parsed.data;

  // Honeypot filled in: almost certainly a bot. Pretend it worked, store nothing.
  if (website) {
    return res.status(201).json({ inquiry: { ref: 'INQ-00000', createdAt: new Date().toISOString() } });
  }

  const { rows } = await query(
    `insert into inquiries (user_type, category, name, email, phone, message)
     values ($1, $2, $3, $4, $5, $6)
     returning ref_no, created_at`,
    [data.userType, data.category, data.name, data.email, data.phone, data.message],
  );

  // Only echo back the reference number. The submitter's details stay server-side.
  res.status(201).json({ inquiry: { ref: formatRef(rows[0].ref_no), createdAt: rows[0].created_at } });
});
