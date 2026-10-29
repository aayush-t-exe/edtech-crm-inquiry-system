// Applies ../schema.sql to the database in DATABASE_URL. Safe to run repeatedly.
//   npm run db:migrate
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const sql = await readFile(new URL('../../schema.sql', import.meta.url), 'utf8');
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const client = new pg.Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });

await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_name in ('admins', 'inquiries', 'inquiry_events', 'revoked_tokens') order by 1`,
  );
  console.log(`Schema applied. Tables: ${rows.map((r) => r.table_name).join(', ')}`);
} finally {
  await client.end();
}
