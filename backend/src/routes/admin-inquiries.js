import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { CATEGORIES, formatRef, LABELS, STATUSES, USER_TYPES } from '../lib/constants.js';
import { HttpError } from '../lib/http-error.js';
import { fieldErrors, listQuerySchema, noteSchema, statusUpdateSchema, uuidSchema } from '../lib/validation.js';

// Every route in this router is behind requireAdmin (see app.js).
export const adminInquiriesRouter = Router();

const TZ = 'Asia/Kolkata'; // date filters are read as Indian calendar days

const SORTS = {
  newest: 'created_at desc, ref_no desc',
  oldest: 'created_at asc, ref_no asc',
  name: 'lower(name) asc, created_at desc',
};

const toInquiry = (r) => ({
  id: r.id,
  ref: formatRef(r.ref_no),
  userType: r.user_type,
  category: r.category,
  name: r.name,
  email: r.email,
  phone: r.phone,
  message: r.message,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function parseListQuery(raw) {
  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'Invalid filters.', fieldErrors(parsed.error));
  return parsed.data;
}

// Builds a parameterised WHERE clause. User input only ever travels as $n parameters,
// never concatenated into SQL, so there is no SQL injection path.
function buildWhere(f) {
  const clauses = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    clauses.push(sql.replace('?', `$${params.length}`));
  };

  if (f.category) add('category = ?', f.category);
  if (f.userType) add('user_type = ?', f.userType);
  if (f.status) add('status = ?', f.status);
  if (f.from) add(`created_at >= (?::date)::timestamp at time zone '${TZ}'`, f.from);
  if (f.to) add(`created_at < ((?::date + 1)::timestamp at time zone '${TZ}')`, f.to);

  // "INQ-00042" or "#42" jumps straight to that one inquiry.
  const ref = f.q?.match(/^(?:inq-?|#)\s*0*(\d{1,12})$/i);
  if (ref) {
    add('ref_no = ?', Number(ref[1]));
  } else if (f.q) {
    const or = [];
    params.push(`%${escapeLike(f.q)}%`);
    or.push(`name ilike $${params.length}`);

    const digits = f.q.replace(/\D/g, '');
    // Phone search ignores spaces/dashes: "98765 43210" finds "+919876543210".
    if (digits.length >= 3) {
      params.push(`%${digits}%`);
      or.push(`phone like $${params.length}`);
    }
    clauses.push(`(${or.join(' or ')})`);
  }

  return { where: clauses.length ? `where ${clauses.join(' and ')}` : '', params };
}

// GET /api/admin/inquiries?category=&userType=&status=&q=&from=&to=&sort=&page=&pageSize=
adminInquiriesRouter.get('/', async (req, res) => {
  const f = parseListQuery(req.query);
  const { where, params } = buildWhere(f);
  const offset = (f.page - 1) * f.pageSize;

  const [list, count] = await Promise.all([
    query(
      `select * from inquiries ${where}
       order by ${SORTS[f.sort]}
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, f.pageSize, offset],
    ),
    query(`select count(*)::int as total from inquiries ${where}`, params),
  ]);

  const total = count.rows[0].total;
  res.json({
    items: list.rows.map(toInquiry),
    total,
    page: f.page,
    pageSize: f.pageSize,
    totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
  });
});

// GET /api/admin/inquiries/stats: numbers for the cards and filter chips at the top of the dashboard.
adminInquiriesRouter.get('/stats', async (_req, res) => {
  const [totals, byCategory, byUserType, byStatus, daily] = await Promise.all([
    query(`
      select
        count(*)::int                                                         as total,
        count(*) filter (where status = 'new')::int                           as open_new,
        count(*) filter (where created_at >= now() - interval '7 days')::int  as last7,
        count(*) filter (where created_at >= now() - interval '14 days'
                           and created_at <  now() - interval '7 days')::int  as prev7
      from inquiries`),
    query('select category as key, count(*)::int as n from inquiries group by category'),
    query('select user_type as key, count(*)::int as n from inquiries group by user_type'),
    query('select status as key, count(*)::int as n from inquiries group by status'),
    query(`
      select to_char(d, 'YYYY-MM-DD') as day, count(i.id)::int as n
      from generate_series((now() at time zone '${TZ}')::date - 13, (now() at time zone '${TZ}')::date, interval '1 day') as d
      left join inquiries i on (i.created_at at time zone '${TZ}')::date = d::date
      group by d order by d`),
  ]);

  const tally = (result, keys) => Object.fromEntries(keys.map((k) => [k, result.rows.find((r) => r.key === k)?.n ?? 0]));
  const s = totals.rows[0];

  res.json({
    total: s.total,
    new: s.open_new,
    last7Days: s.last7,
    previous7Days: s.prev7,
    byCategory: tally(byCategory, CATEGORIES),
    byUserType: tally(byUserType, USER_TYPES),
    byStatus: tally(byStatus, STATUSES),
    daily: daily.rows,
  });
});

// GET /api/admin/inquiries/export.csv: same filters as the table, as a spreadsheet.
adminInquiriesRouter.get('/export.csv', async (req, res) => {
  const f = parseListQuery(req.query);
  const { where, params } = buildWhere(f);
  const { rows } = await query(`select * from inquiries ${where} order by ${SORTS[f.sort]} limit 10000`, params);

  // Cells starting with = + - @ are prefixed with ' so Excel doesn't run them as formulas.
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ['Ref', 'Date (IST)', 'Name', 'Phone', 'Email', 'User Type', 'Category', 'Status', 'Message'];
  const istDate = (d) => new Date(d).toLocaleString('en-IN', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
  const lines = rows.map((r) =>
    [
      formatRef(r.ref_no),
      istDate(r.created_at),
      r.name,
      r.phone,
      r.email,
      LABELS[r.user_type],
      LABELS[r.category],
      LABELS[r.status],
      r.message,
    ]
      .map(cell)
      .join(','),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="inquiries-${stamp}.csv"`);
  // BOM so Excel opens UTF-8 names (e.g. Hindi) correctly.
  res.send('﻿' + [header.map(cell).join(','), ...lines].join('\r\n'));
});

function parseId(raw) {
  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(404, 'Inquiry not found.');
  return parsed.data;
}

async function loadEvents(inquiryId) {
  const { rows } = await query(
    `select e.id, e.kind, e.from_status, e.to_status, e.note, e.created_at, a.name as admin_name
     from inquiry_events e left join admins a on a.id = e.admin_id
     where e.inquiry_id = $1 order by e.created_at asc`,
    [inquiryId],
  );
  return rows.map((e) => ({
    id: e.id,
    kind: e.kind,
    fromStatus: e.from_status,
    toStatus: e.to_status,
    note: e.note,
    adminName: e.admin_name,
    createdAt: e.created_at,
  }));
}

// GET /api/admin/inquiries/:id: one inquiry with its activity timeline.
adminInquiriesRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { rows } = await query('select * from inquiries where id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, 'Inquiry not found.');
  res.json({ inquiry: toInquiry(rows[0]), events: await loadEvents(id) });
});

// PATCH /api/admin/inquiries/:id  { status }: move an inquiry through the pipeline.
adminInquiriesRouter.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = statusUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, 'Invalid status.', fieldErrors(parsed.error));
  const { status } = parsed.data;

  const inquiry = await withTransaction(async (db) => {
    // Lock the row so two admins changing status at once can't corrupt the timeline.
    const current = await db.query('select status from inquiries where id = $1 for update', [id]);
    if (!current.rows[0]) throw new HttpError(404, 'Inquiry not found.');
    const from = current.rows[0].status;

    const updated = await db.query('update inquiries set status = $2 where id = $1 returning *', [id, status]);
    if (from !== status) {
      await db.query(
        `insert into inquiry_events (inquiry_id, admin_id, kind, from_status, to_status)
         values ($1, $2, 'status_change', $3, $4)`,
        [id, req.admin.id, from, status],
      );
    }
    return updated.rows[0];
  });

  res.json({ inquiry: toInquiry(inquiry), events: await loadEvents(id) });
});

// POST /api/admin/inquiries/:id/notes  { note }: internal note, visible to admins only.
adminInquiriesRouter.post('/:id/notes', async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = noteSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, 'Invalid note.', fieldErrors(parsed.error));

  const exists = await query('select 1 from inquiries where id = $1', [id]);
  if (!exists.rows[0]) throw new HttpError(404, 'Inquiry not found.');

  await query(`insert into inquiry_events (inquiry_id, admin_id, kind, note) values ($1, $2, 'note', $3)`, [
    id,
    req.admin.id,
    parsed.data.note,
  ]);
  res.status(201).json({ events: await loadEvents(id) });
});
