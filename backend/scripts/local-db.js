// Optional: runs a throwaway PostgreSQL on your machine (no Docker, no Supabase account needed)
// so you can try the app offline. Production always uses Supabase.
//   npm run db:local
// then in another terminal set DATABASE_URL=postgresql://postgres:postgres@localhost:54329/crm
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dataDir = fileURLToPath(new URL('../.local-pg', import.meta.url));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: 54329,
  persistent: true,
  postgresFlags: ['-c', 'io_method=sync'],
});

if (!existsSync(dataDir)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('crm');
} catch {
  // already exists
}
console.log('Local Postgres running: postgresql://postgres:postgres@localhost:54329/crm  (Ctrl+C to stop)');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
