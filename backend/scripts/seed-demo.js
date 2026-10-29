// Fills the database with realistic sample inquiries so the dashboard has something to show.
//   npm run db:seed-demo            -> adds 48 sample inquiries
//   npm run db:seed-demo -- --reset -> deletes ALL inquiries first, then adds them
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const reset = process.argv.includes('--reset');

// Deterministic pseudo-random numbers, so every run produces the same demo data.
let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const first = [
  'Aarav',
  'Riya',
  'Kabir',
  'Ananya',
  'Vihaan',
  'Ishita',
  'Arjun',
  'Meera',
  'Rohan',
  'Saanvi',
  'Aditya',
  'Diya',
  'Karan',
  'Pooja',
  'Nikhil',
  'Sneha',
  'Yash',
  'Tanvi',
  'Harsh',
  'Neha',
  'Dev',
  'Priya',
  'Manish',
  'Kavya',
];
const last = [
  'Sharma',
  'Verma',
  'Gupta',
  'Singh',
  'Mehta',
  'Iyer',
  'Reddy',
  'Nair',
  'Joshi',
  'Patel',
  'Agarwal',
  'Chauhan',
  'Kulkarni',
  'Das',
  'Rathore',
  'Bansal',
];
const schools = [
  "St. Xavier's School, Jaipur",
  'Delhi Public School, Udaipur',
  'Kendriya Vidyalaya No. 2, Kota',
  'Sanskar International School',
  'Mayoor School, Ajmer',
  'Neerja Modi School',
  'Ryan International School, Indore',
  'Little Flower Convent, Jodhpur',
];

const messages = {
  scholarship: [
    'My daughter is in Class 9 and scored 92% last year. Is she eligible for the merit scholarship, and what documents do we need?',
    'When is the last date to apply for the scholarship test this year? Is there an application fee?',
    'Is there any need-based scholarship for students whose family income is below 3 lakh per year?',
    'I cleared the first round of the scholarship exam. When will the results of the second round be announced?',
    'Can students from government schools also apply for the scholarship programme?',
  ],
  concert: [
    'We would like 6 passes for the annual inter-school music concert. Are seats still available?',
    'Our school choir wants to perform at the concert. What is the registration process for participating schools?',
    'What time does the concert start and is parking available at the venue?',
    'Is there a student discount on concert tickets if we book for the whole class?',
    'My son plays the tabla. Is there an audition for solo performers at the concert?',
  ],
  admission: [
    'I want to know the admission process for Class 11 Science (PCM). Is there an entrance test?',
    'What is the fee structure for Class 6 admission, and is transport included?',
    'We are relocating to Jaipur in December. Can my son take mid-session admission in Class 8?',
    'Please share the admission form and the list of documents required for nursery admission.',
    'Do you offer coaching support for JEE along with the regular Class 11 programme?',
  ],
  general: [
    'Can someone call me back regarding your skill development courses for school students?',
    'Do you run workshops for teachers on digital classrooms? Our school is interested.',
    'I could not log in to the student portal after resetting my password. Please help.',
    'What are your office timings? I want to visit and discuss the programmes in person.',
    'We would like to partner with you for career counselling sessions at our school.',
  ],
};

const statuses = ['new', 'new', 'new', 'contacted', 'contacted', 'in_progress', 'resolved', 'resolved', 'closed'];
const notes = [
  'Called back, parent will share documents by Friday.',
  'Sent fee structure PDF on WhatsApp.',
  'Asked to visit the campus on Saturday 11 AM.',
  'Forwarded to the scholarship committee.',
  'No answer on first call, will retry tomorrow.',
];

const rows = [];
for (let i = 0; i < 48; i++) {
  const category = pick(['scholarship', 'scholarship', 'admission', 'admission', 'admission', 'concert', 'general']);
  const userType = category === 'concert' && rand() < 0.4 ? 'school' : pick(['parent', 'parent', 'student', 'student', 'school']);
  const person = `${pick(first)} ${pick(last)}`;
  const name = userType === 'school' ? `${person} (${pick(schools)})` : person;
  const phone = `+91${pick(['98', '97', '94', '88', '79', '70', '63'])}${String(Math.floor(rand() * 1e8)).padStart(8, '0')}`;
  const emailUser = person.toLowerCase().replace(/[^a-z]+/g, '.');
  const email = `${emailUser}${Math.floor(rand() * 90 + 10)}@${pick(['gmail.com', 'yahoo.in', 'outlook.com', 'rediffmail.com'])}`;
  // Spread over the last 30 days, newer ones more likely to still be "new".
  const daysAgo = Math.floor(rand() ** 1.6 * 30);
  const createdAt = new Date(Date.now() - daysAgo * 864e5 - Math.floor(rand() * 864e5));
  const status = daysAgo < 2 ? 'new' : pick(statuses);
  rows.push({ category, userType, name, email, phone, message: pick(messages[category]), status, createdAt });
}
rows.sort((a, b) => a.createdAt - b.createdAt);

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const client = new pg.Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('begin');
  if (reset) await client.query('delete from inquiries');
  const admin = (await client.query('select id from admins order by created_at limit 1')).rows[0];

  for (const r of rows) {
    const { rows: inserted } = await client.query(
      `insert into inquiries (user_type, category, name, email, phone, message, status, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $8) returning id`,
      [r.userType, r.category, r.name, r.email, r.phone, r.message, r.status, r.createdAt],
    );
    // Give handled inquiries a believable timeline.
    if (admin && r.status !== 'new') {
      const at = new Date(r.createdAt.getTime() + 3 * 36e5);
      await client.query(
        `insert into inquiry_events (inquiry_id, admin_id, kind, from_status, to_status, created_at)
         values ($1, $2, 'status_change', 'new', $3, $4)`,
        [inserted[0].id, admin.id, r.status, at],
      );
      if (rand() < 0.6) {
        await client.query(`insert into inquiry_events (inquiry_id, admin_id, kind, note, created_at) values ($1, $2, 'note', $3, $4)`, [
          inserted[0].id,
          admin.id,
          pick(notes),
          new Date(at.getTime() + 6e5),
        ]);
      }
    }
  }
  await client.query('commit');
  console.log(`Inserted ${rows.length} demo inquiries${reset ? ' (after clearing old ones)' : ''}.`);
} catch (err) {
  await client.query('rollback');
  throw err;
} finally {
  await client.end();
}
