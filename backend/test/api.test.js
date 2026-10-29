// End-to-end API tests against a real, throwaway PostgreSQL (embedded-postgres).
//   npm test
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import bcrypt from 'bcrypt';
import EmbeddedPostgres from 'embedded-postgres';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const PORT = 54000 + Math.floor(Math.random() * 900);
const dataDir = join(tmpdir(), `crm-test-pg-${PORT}`);
const pgServer = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
  // Postgres 18's default async-IO worker processes outlive the server on Windows; plain sync IO doesn't.
  postgresFlags: ['-c', 'io_method=sync', '-c', 'timezone=UTC'], // UTC sessions, like Supabase
});

const ADMIN = { email: 'admin@test.dev', password: 'correct horse battery', name: 'Test Admin' };
const SECRET = 'test-secret-'.padEnd(48, 'x');

let app;
let pool;

const valid = {
  userType: 'parent',
  category: 'admission',
  name: '  Riya   Sharma ',
  email: 'Riya@Example.com',
  phone: '+91 98765-43210',
  message: 'What is the admission process for Class 11 Science?',
};

before(async () => {
  await pgServer.initialise();
  await pgServer.start();
  await pgServer.createDatabase('crm_test');

  process.env.DATABASE_URL = `postgresql://postgres:postgres@localhost:${PORT}/crm_test`;
  process.env.JWT_SECRET = SECRET;
  process.env.JWT_EXPIRES_IN = '1h';

  const db = await import('../src/db.js');
  pool = db.pool;
  await pool.query(await readFile(new URL('../../schema.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../../schema.sql', import.meta.url), 'utf8')); // idempotent
  await pool.query('insert into admins (email, name, password_hash) values ($1, $2, $3)', [
    ADMIN.email,
    ADMIN.name,
    await bcrypt.hash(ADMIN.password, 4),
  ]);

  ({ app } = await import('../src/app.js'));
});

after(async () => {
  await pool?.end();
  await pgServer.stop();
  await rm(dataDir, { recursive: true, force: true });
});

async function login() {
  const res = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: ADMIN.password });
  assert.equal(res.status, 200);
  return res.body.token;
}

describe('public inquiry form', () => {
  test('saves a valid inquiry and returns only a reference number', async () => {
    const res = await request(app).post('/api/inquiries').send(valid);
    assert.equal(res.status, 201);
    assert.match(res.body.inquiry.ref, /^INQ-\d{5}$/);
    assert.equal(res.body.inquiry.email, undefined, 'must not echo personal data');

    const { rows } = await pool.query('select * from inquiries order by ref_no desc limit 1');
    assert.equal(rows[0].name, 'Riya Sharma');
    assert.equal(rows[0].email, 'riya@example.com');
    assert.equal(rows[0].phone, '+919876543210');
    assert.equal(rows[0].status, 'new');
  });

  test('rejects bad input with a message per field', async () => {
    const res = await request(app)
      .post('/api/inquiries')
      .send({ userType: 'teacher', category: 'sports', name: 'R', email: 'nope', phone: 'call me', message: 'hi' });
    assert.equal(res.status, 400);
    for (const field of ['userType', 'category', 'name', 'email', 'phone', 'message']) {
      assert.ok(res.body.fields[field], `expected an error for ${field}`);
    }
  });

  test('honeypot submissions look successful but are not stored', async () => {
    const before = (await pool.query('select count(*)::int as n from inquiries')).rows[0].n;
    const res = await request(app)
      .post('/api/inquiries')
      .send({ ...valid, website: 'http://spam.example' });
    assert.equal(res.status, 201);
    const afterCount = (await pool.query('select count(*)::int as n from inquiries')).rows[0].n;
    assert.equal(afterCount, before);
  });

  test('database CHECK constraints back up the API validation', async () => {
    await assert.rejects(
      pool.query(`insert into inquiries (user_type, category, name, email, phone, message)
                  values ('alien', 'general', 'Test', 'a@b.co', '9876543210', 'long enough message')`),
      /inquiries_user_type_valid/,
    );
  });
});

describe('custom JWT auth', () => {
  test('wrong password and unknown email get the same 401', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'wrong' });
    const b = await request(app).post('/api/auth/login').send({ email: 'ghost@test.dev', password: 'wrong' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error, b.body.error);
  });

  test('login returns a signed HS256 JWT and sets an httpOnly cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ADMIN@test.dev', password: ADMIN.password });
    assert.equal(res.status, 200);
    const decoded = jwt.verify(res.body.token, SECRET, { algorithms: ['HS256'] });
    assert.equal(decoded.email, ADMIN.email);
    assert.ok(decoded.sub);
    assert.ok(decoded.exp > decoded.iat);
    assert.equal(res.body.admin.password_hash, undefined);

    const cookie = res.headers['set-cookie'].join(';');
    assert.match(cookie, /crm_token=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
  });

  test('protected routes reject missing, forged, expired and alg:none tokens', async () => {
    const id = (await pool.query('select id from admins')).rows[0].id;
    const forged = jwt.sign({ email: ADMIN.email }, 'some-other-secret-that-is-long-enough!!', {
      subject: id,
      issuer: 'edtech-crm-api',
      audience: 'edtech-crm-admin',
    });
    const expired = jwt.sign({ email: ADMIN.email }, SECRET, {
      subject: id,
      issuer: 'edtech-crm-api',
      audience: 'edtech-crm-admin',
      expiresIn: -10,
    });
    const none = jwt.sign({ email: ADMIN.email, sub: id, iss: 'edtech-crm-api', aud: 'edtech-crm-admin' }, '', { algorithm: 'none' });

    assert.equal((await request(app).get('/api/admin/inquiries')).status, 401);
    for (const token of [forged, expired, none, 'garbage']) {
      const res = await request(app).get('/api/admin/inquiries').set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 401, `token should be rejected: ${token.slice(0, 20)}`);
    }
    const exp = await request(app).get('/api/admin/inquiries').set('Authorization', `Bearer ${expired}`);
    assert.match(exp.body.error, /expired/i);
  });

  test('works with both the Bearer header and the cookie', async () => {
    const token = await login();
    const viaHeader = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    const viaCookie = await request(app).get('/api/auth/me').set('Cookie', `crm_token=${token}`);
    assert.equal(viaHeader.status, 200);
    assert.equal(viaCookie.status, 200);
    assert.equal(viaHeader.body.admin.email, ADMIN.email);
  });

  test("a deleted admin's token stops working", async () => {
    const hash = await bcrypt.hash('temporary-pass', 4);
    await pool.query(`insert into admins (email, name, password_hash) values ('temp@test.dev', 'Temp', $1)`, [hash]);
    const res = await request(app).post('/api/auth/login').send({ email: 'temp@test.dev', password: 'temporary-pass' });
    await pool.query(`delete from admins where email = 'temp@test.dev'`);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    assert.equal(me.status, 401);
  });

  test('logout revokes that token (even a copied one) but not other sessions', async () => {
    const a = await login();
    const b = await login();
    const out = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${a}`);
    assert.equal(out.status, 204);
    assert.match(out.headers['set-cookie'].join(';'), /crm_token=;/);

    const reused = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${a}`);
    assert.equal(reused.status, 401);
    assert.match(reused.body.error, /logged out/i);
    assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${b}`)).status, 200);
  });

  test('a valid signature without a token id (jti) is rejected', async () => {
    const id = (await pool.query('select id from admins where email = $1', [ADMIN.email])).rows[0].id;
    const noJti = jwt.sign({ email: ADMIN.email }, SECRET, { subject: id, issuer: 'edtech-crm-api', audience: 'edtech-crm-admin' });
    assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${noJti}`)).status, 401);
  });

  test('passwords are stored as bcrypt hashes only', async () => {
    const { rows } = await pool.query('select password_hash from admins where email = $1', [ADMIN.email]);
    assert.match(rows[0].password_hash, /^\$2[aby]\$\d{2}\$/);
    await assert.rejects(
      pool.query(`insert into admins (email, password_hash) values ('plain@test.dev', 'hunter2')`),
      /admins_hash_is_bcrypt/,
    );
  });
});

describe('admin dashboard API', () => {
  let token;
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);

  before(async () => {
    token = await login();
    const extra = [
      { ...valid, name: 'Kabir Mehta', phone: '9123456789', category: 'scholarship', userType: 'student' },
      { ...valid, name: 'Ananya Iyer', phone: '+91 70000 11111', category: 'concert', userType: 'school' },
      { ...valid, name: 'Kabir Singh', phone: '9988776655', category: 'general', userType: 'parent' },
      { ...valid, name: '100%_Literal', phone: '9000000000', category: 'general', userType: 'student' },
    ];
    for (const body of extra) assert.equal((await request(app).post('/api/inquiries').send(body)).status, 201);
  });

  test('lists inquiries newest first with pagination info', async () => {
    const res = await auth(request(app).get('/api/admin/inquiries?pageSize=2'));
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 2);
    assert.ok(res.body.total >= 5);
    assert.equal(res.body.totalPages, Math.ceil(res.body.total / 2));
    const [a, b] = res.body.items;
    assert.ok(new Date(a.createdAt) >= new Date(b.createdAt));
    for (const key of ['name', 'phone', 'email', 'userType', 'category', 'createdAt', 'status']) assert.ok(key in a);
  });

  test('filters by category and by user type', async () => {
    const cat = await auth(request(app).get('/api/admin/inquiries?category=scholarship'));
    assert.ok(cat.body.items.length >= 1);
    assert.ok(cat.body.items.every((i) => i.category === 'scholarship'));

    const type = await auth(request(app).get('/api/admin/inquiries?userType=school'));
    assert.ok(type.body.items.every((i) => i.userType === 'school'));

    const both = await auth(request(app).get('/api/admin/inquiries?category=general&userType=parent'));
    assert.deepEqual(
      both.body.items.map((i) => i.name),
      ['Kabir Singh'],
    );
  });

  test('searches by name (case-insensitive) and by phone (ignoring spaces)', async () => {
    const byName = await auth(request(app).get('/api/admin/inquiries?q=kabir'));
    assert.deepEqual(byName.body.items.map((i) => i.name).sort(), ['Kabir Mehta', 'Kabir Singh']);

    const byPhone = await auth(request(app).get('/api/admin/inquiries?q=70000%2011111'));
    assert.deepEqual(
      byPhone.body.items.map((i) => i.name),
      ['Ananya Iyer'],
    );

    const byRef = await auth(request(app).get('/api/admin/inquiries?q=INQ-00001'));
    assert.equal(byRef.body.items[0].ref, 'INQ-00001');
  });

  test('search treats % and _ literally (no wildcard injection)', async () => {
    const res = await auth(request(app).get('/api/admin/inquiries?q=100%25_'));
    assert.deepEqual(
      res.body.items.map((i) => i.name),
      ['100%_Literal'],
    );
  });

  test('rejects unknown filter values and impossible dates', async () => {
    assert.equal((await auth(request(app).get('/api/admin/inquiries?category=sports'))).status, 400);
    assert.equal((await auth(request(app).get('/api/admin/inquiries?from=2026-02-30'))).status, 400);
    assert.equal((await auth(request(app).get('/api/admin/inquiries?from=2026-05-02&to=2026-05-01'))).status, 400);
  });

  test('date filters use Indian calendar days (IST) even though the DB session is UTC', async () => {
    // 1 Jan 2026 00:30 IST is still 31 Dec 2025 in UTC; it must count as 1 Jan.
    const { rows } = await pool.query(
      `insert into inquiries (user_type, category, name, email, phone, message, created_at)
       values ('parent', 'general', 'New Year Early', 'ny@test.dev', '9000011111', 'Happy new year question',
               '2026-01-01 00:30:00+05:30'),
              ('parent', 'general', 'New Year Eve', 'nye@test.dev', '9000022222', 'Last question of the year',
               '2025-12-31 23:30:00+05:30')
       returning id`,
    );
    assert.equal(rows.length, 2);
    const jan1 = await auth(request(app).get('/api/admin/inquiries?from=2026-01-01&to=2026-01-01'));
    assert.deepEqual(
      jan1.body.items.map((i) => i.name),
      ['New Year Early'],
    );
    const dec31 = await auth(request(app).get('/api/admin/inquiries?to=2025-12-31&q=New Year'));
    assert.deepEqual(
      dec31.body.items.map((i) => i.name),
      ['New Year Eve'],
    );
    await pool.query(`delete from inquiries where email in ('ny@test.dev', 'nye@test.dev')`);
  });

  test('status change is saved and logged on the timeline, with notes', async () => {
    const list = await auth(request(app).get('/api/admin/inquiries?q=Ananya'));
    const id = list.body.items[0].id;

    const patch = await auth(request(app).patch(`/api/admin/inquiries/${id}`).send({ status: 'contacted' }));
    assert.equal(patch.status, 200);
    assert.equal(patch.body.inquiry.status, 'contacted');

    const note = await auth(request(app).post(`/api/admin/inquiries/${id}/notes`).send({ note: 'Called, sending passes.' }));
    assert.equal(note.status, 201);

    const detail = await auth(request(app).get(`/api/admin/inquiries/${id}`));
    assert.deepEqual(
      detail.body.events.map((e) => e.kind),
      ['status_change', 'note'],
    );
    assert.equal(detail.body.events[0].fromStatus, 'new');
    assert.equal(detail.body.events[0].adminName, ADMIN.name);

    const bad = await auth(request(app).patch(`/api/admin/inquiries/${id}`).send({ status: 'deleted' }));
    assert.equal(bad.status, 400);
    const missing = await auth(request(app).get('/api/admin/inquiries/not-a-uuid'));
    assert.equal(missing.status, 404);
  });

  test('stats and CSV export', async () => {
    const stats = await auth(request(app).get('/api/admin/inquiries/stats'));
    assert.equal(stats.status, 200);
    assert.ok(stats.body.total >= 5);
    assert.equal(stats.body.daily.length, 14);
    assert.equal(
      Object.values(stats.body.byCategory).reduce((a, b) => a + b, 0),
      stats.body.total,
    );

    const csv = await auth(request(app).get('/api/admin/inquiries/export.csv?category=concert'));
    assert.equal(csv.status, 200);
    assert.match(csv.headers['content-type'], /text\/csv/);
    const lines = csv.text.trim().split('\r\n');
    assert.match(lines[0], /Ref/);
    assert.ok(lines.slice(1).every((l) => l.includes('"Concert"')));
    assert.ok(lines[1].includes(`"'+917000011111"`), 'phone starting with + is escaped against CSV formula injection');
  });
});
