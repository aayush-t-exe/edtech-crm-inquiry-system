import { z } from 'zod';
import { CATEGORIES, STATUSES, USER_TYPES } from './constants.js';

// Collapse runs of whitespace and trim, so "  Riya   Sharma " is stored as "Riya Sharma".
const cleanText = (s) => s.replace(/\s+/g, ' ').trim();

// Accepts "+91 98765-43210", "(0141) 222 3333", "9876543210" ... and stores "+919876543210".
export function normalizePhone(raw) {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  return (trimmed.startsWith('+') ? '+' : '') + digits;
}

export const inquirySchema = z.object({
  userType: z.enum(USER_TYPES, { error: 'Choose who you are: Parent, Student or School.' }),
  category: z.enum(CATEGORIES, { error: 'Choose a category.' }),
  name: z
    .string({ error: 'Name is required.' })
    .transform(cleanText)
    .pipe(z.string().min(2, 'Name must be at least 2 characters.').max(100, 'Name is too long.')),
  email: z.string({ error: 'Email is required.' }).trim().toLowerCase().pipe(z.email('Enter a valid email address.').max(254)),
  phone: z
    .string({ error: 'Phone number is required.' })
    .refine((v) => !/[^0-9+\-\s().]/.test(v), 'Phone can only contain digits, spaces, +, - and brackets.')
    .transform(normalizePhone)
    .pipe(z.string().regex(/^\+?[0-9]{7,15}$/, 'Enter a valid phone number (7 to 15 digits).')),
  message: z
    .string({ error: 'Message is required.' })
    .trim()
    .pipe(z.string().min(10, 'Tell us a little more (at least 10 characters).').max(2000, 'Message is too long (2000 characters max).')),
  // Honeypot: a hidden field real people never fill in. Bots usually do.
  website: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string({ error: 'Email is required.' }).trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.').max(200),
});

const optionalEnum = (values) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.enum(values).optional());

// A real calendar date: "2026-02-30" passes a regex but isn't a day, so round-trip it.
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Not a real date.')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const listQuerySchema = z
  .object({
    category: optionalEnum(CATEGORIES),
    userType: optionalEnum(USER_TYPES),
    status: optionalEnum(STATUSES),
    q: z.string().trim().max(100).optional(),
    from: isoDate,
    to: isoDate,
    sort: z.enum(['newest', 'oldest', 'name']).default('newest'),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, { message: '"From" date is after "to" date.', path: ['from'] });

export const statusUpdateSchema = z.object({
  status: z.enum(STATUSES, { error: 'Unknown status.' }),
});

export const noteSchema = z.object({
  note: z.string({ error: 'Note is required.' }).trim().pipe(z.string().min(1, 'Note is empty.').max(1000, 'Note is too long.')),
});

export const uuidSchema = z.uuid();

// Turn zod issues into { field: message } for the frontend to show under each input.
export function fieldErrors(error) {
  const out = {};
  for (const issue of error.issues) {
    const key = issue.path[0] ?? '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
