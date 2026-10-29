// Creates an admin, or resets the password if the email already exists.
//   npm run db:create-admin -- admin@example.com "a-strong-password" "Admin Name"
// or set ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME in .env and run without arguments.
import bcrypt from 'bcrypt';
import pg from 'pg';

const [email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD, name = process.env.ADMIN_NAME || 'Admin'] =
  process.argv.slice(2);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
if (!email || !password) {
  console.error('Usage: npm run db:create-admin -- <email> <password> [name]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Use a password of at least 8 characters.');
  process.exit(1);
}

// Cost factor 12: about 250 ms per hash, slow enough to make brute force expensive.
const passwordHash = await bcrypt.hash(password, 12);

const url = process.env.DATABASE_URL;
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const client = new pg.Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });
await client.connect();
try {
  const existing = await client.query('select id from admins where lower(email) = lower($1)', [email]);
  if (existing.rows[0]) {
    await client.query('update admins set password_hash = $2, name = $3 where id = $1', [existing.rows[0].id, passwordHash, name]);
    console.log(`Updated password for ${email}.`);
  } else {
    await client.query('insert into admins (email, name, password_hash) values (lower($1), $2, $3)', [email, name, passwordHash]);
    console.log(`Created admin ${email}.`);
  }
} finally {
  await client.end();
}
