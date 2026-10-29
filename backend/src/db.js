import pg from 'pg';
import { config } from './config.js';

// Return Postgres `bigint` (int8) as a JS number. Our counts and ref numbers stay far below 2^53.
pg.types.setTypeParser(20, (value) => Number(value));

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(config.databaseUrl);

// Supabase requires TLS. Its pooler presents a certificate signed by Supabase's own CA,
// so we encrypt the connection without pinning that CA.
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  // Serverless functions run many small instances; keep each one's pool tiny.
  max: Number(process.env.PG_POOL_MAX) || 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  // An idle client died (e.g. the pooler restarted). pg will open a new one on the next query.
  console.error('[db] idle client error:', err.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

// Run several statements in one transaction.
export async function withTransaction(fn) {
  const client = await pool.connect();
  let broken;
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    try {
      await client.query('rollback');
    } catch (rollbackErr) {
      broken = rollbackErr; // connection is dead; don't hand it back to the pool
    }
    throw err; // always surface the original error, not the rollback failure
  } finally {
    client.release(broken);
  }
}
