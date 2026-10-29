# EdTech CRM & Inquiry System

A full-stack inquiry desk for an EdTech team. Parents, students and schools send a question through a public form; admins log in with **custom JWT authentication** to see, filter, search and work through every inquiry.

**Live demo:** https://edtech-crm-aayush.vercel.app &nbsp;·&nbsp; **Admin:** https://edtech-crm-aayush.vercel.app/admin &nbsp;·&nbsp; **API health:** https://edtech-crm-api.vercel.app/api/health

> **Demo admin login:** `demo@inquirydesk.dev` / `Demo@12345` (the login page also has a "Fill in" button).

![Public inquiry form](docs/screenshots/public-form.jpg)

| Admin dashboard | Inquiry detail |
| --- | --- |
| ![Dashboard](docs/screenshots/dashboard.jpg) | ![Detail drawer](docs/screenshots/inquiry-detail.jpg) |

| Submitted (reference number + stamped ticket) | Phone: form | Phone: dashboard |
| --- | --- | --- |
| ![Submitted](docs/screenshots/submitted.jpg) | ![Phone form](docs/screenshots/mobile-form.jpg) | ![Phone dashboard](docs/screenshots/mobile-dashboard.jpg) |

---

## Requirements checklist

| Brief | Where |
| --- | --- |
| Public form: User Type dropdown (Parent / Student / School) | [`InquiryPage.tsx`](frontend/src/pages/InquiryPage.tsx) |
| Category dropdown (Scholarship / Concert / Admission / General Query) | same |
| Name, Email, Phone, Message | same, validated in the browser **and** on the server ([`validation.js`](backend/src/lib/validation.js)) **and** by `CHECK` constraints in the database |
| Saves directly into Supabase PostgreSQL | `POST /api/inquiries` → [`public-inquiries.js`](backend/src/routes/public-inquiries.js), using `pg` with the Supabase connection string |
| Custom JWT auth, no Supabase Auth | [`routes/auth.js`](backend/src/routes/auth.js), [`lib/tokens.js`](backend/src/lib/tokens.js) |
| Password hashing with bcrypt | `bcrypt` (cost 12) in [`create-admin.js`](backend/scripts/create-admin.js); `bcrypt.compare` at login |
| Protected-routes middleware | [`middleware/auth.js`](backend/src/middleware/auth.js), mounted on every `/api/admin/*` route in [`app.js`](backend/src/app.js) |
| Protected dashboard route | `/admin` in [`App.tsx`](frontend/src/App.tsx) (UI guard) + the server middleware (real guard) |
| Table: Name, Phone, Email, User Type, Category, Date, Status | [`DashboardPage.tsx`](frontend/src/pages/DashboardPage.tsx) |
| Filter by Category, filter by User Type | dashboard filter bar → `GET /api/admin/inquiries?category=&userType=` |
| Search by Name or Phone | search box → `?q=` (name: case-insensitive; phone: ignores spaces, dashes and `+91`) |
| `schema.sql` | [`schema.sql`](schema.sql) |
| `.env.example` | [`.env.example`](.env.example) (also [`backend/.env.example`](backend/.env.example), [`frontend/.env.example`](frontend/.env.example)) |
| README with setup and JWT testing | this file |
| Live demo | links at the top |

### Extras

- **Status workflow:** New → Contacted → In progress → Resolved → Closed, changed inline from the table or from the detail panel.
- **Activity timeline and internal notes** per inquiry (who changed what, and when).
- **Reference numbers** (`INQ-00042`) shown to the person who submits, searchable by admins.
- **Quick actions:** call, WhatsApp (pre-filled message) or email straight from an inquiry.
- **Dashboard stats:** total, waiting for a reply, this week vs last week, 14-day chart, breakdown by category (click to filter).
- **Also filter by status and date range** (dates are read as Indian calendar days, IST); sort by date or name; pagination.
- **Filters live in the URL**, so a filtered view can be bookmarked or shared.
- **CSV export** of the current filtered view (safe against spreadsheet formula injection).
- **Spam protection:** honeypot field and rate limits on the form and the login.
- **Responsive:** the table turns into cards on phones; keyboard and screen-reader friendly.
- **Logout really logs out:** each JWT has a unique id (`jti`); logout puts it on a revoked list, so even a copied token stops working.
- **20 automated API tests** against a real Postgres.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router, plain CSS (design tokens), lucide icons, sonner toasts |
| Backend | Node.js 20+, Express 5, `pg`, `bcrypt`, `jsonwebtoken`, `zod`, `helmet`, `express-rate-limit` |
| Database | Supabase PostgreSQL, through its connection string (no Supabase client SDK, no Supabase Auth) |
| Hosting | Vercel (two projects: `frontend/` as a static site, `backend/` as a serverless function) |
| Tests | Node's built-in test runner + `supertest` + `embedded-postgres` |

### How it fits together

```mermaid
flowchart LR
  V[Visitor] -->|fills form| FE[React app<br/>frontend/]
  A[Admin] -->|logs in| FE
  FE -->|/api/* same origin| P[Vercel rewrite]
  P --> BE[Express API<br/>backend/]
  BE -->|bcrypt + JWT| BE
  BE -->|pg, TLS| DB[(Supabase<br/>PostgreSQL)]
```

The frontend calls `/api/...` on its own domain. In development Vite forwards those calls to `localhost:4000`; on Vercel, [`frontend/vercel.json`](frontend/vercel.json) proxies them to the backend deployment. Because the browser only ever talks to one origin, the login cookie can be `httpOnly` + `SameSite=Lax` and no CORS setup is needed.

### Project structure

```
.
├── schema.sql                  tables, constraints, indexes, RLS lock-down
├── docs/screenshots/
├── .env.example
├── backend/
│   ├── api/index.js            Vercel entry (exports the Express app)
│   ├── src/
│   │   ├── app.js              middleware + route wiring
│   │   ├── server.js           local entry (app.listen)
│   │   ├── config.js           env validation (fails fast)
│   │   ├── db.js               pg pool + transactions
│   │   ├── lib/                tokens (JWT), validation (zod), constants
│   │   ├── middleware/         auth (requireAdmin), rate limits, errors
│   │   └── routes/             auth, public inquiries, admin inquiries
│   ├── scripts/                migrate, create-admin, seed-demo, local-db
│   └── test/api.test.js
└── frontend/
    ├── vercel.json             /api proxy + SPA fallback
    └── src/
        ├── pages/              InquiryPage, LoginPage, DashboardPage
        ├── components/         Ticket, StatsRow, InquiryDrawer, Status
        ├── lib/                api client, auth context, formatting
        └── styles/
```

---

## Run it locally

**Prerequisites:** Node.js 20.12 or newer, and a free [Supabase](https://supabase.com) project.

### 1. Database (Supabase)

1. Create a Supabase project (any region; *Mumbai / ap-south-1* is closest for India). Note the database password you set.
2. Open **Connect** (top bar of the project) → **Connection string** → **Transaction pooler** and copy the URI. It looks like
   `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`
3. Create the tables, either:
   - **SQL editor:** paste the contents of [`schema.sql`](schema.sql) and click **Run**, or
   - **from the terminal** after step 2 below: `npm run db:migrate`

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
```

Edit `backend/.env`:

- `DATABASE_URL`: the Supabase URI from above, with your password filled in
- `JWT_SECRET`: a long random string. Generate one with
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

Then:

```bash
npm run db:migrate                                   # creates the tables (safe to re-run)
npm run db:create-admin -- admin@example.com "a-strong-password" "Your Name"
npm run db:seed-demo                                 # optional: 48 realistic sample inquiries
npm run dev                                          # API on http://localhost:4000
```

Check it: http://localhost:4000/api/health should return `{"ok":true,"db":"connected",...}`.

> **No Supabase account handy?** `npm run db:local` starts a throwaway PostgreSQL on your machine (via `embedded-postgres`) at `postgresql://postgres:postgres@localhost:54329/crm`. Put that in `DATABASE_URL` and continue. The deployed app always uses Supabase.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173  (proxies /api to :4000)
```

- Public form: http://localhost:5173
- Admin: http://localhost:5173/admin (log in with the admin you created)

### Environment variables

| Variable | Where | Required | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | backend | yes | Supabase Postgres connection string |
| `JWT_SECRET` | backend | yes | HS256 signing secret, at least 32 characters |
| `JWT_EXPIRES_IN` | backend | no (`8h`) | session length |
| `PORT` | backend | no (`4000`) | local port |
| `CORS_ORIGINS` | backend | no | only if a browser on another domain calls the API directly |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | backend | no | defaults for `npm run db:create-admin` |
| `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD` | frontend | no | shows a demo-login box on the login page |

---

## How the custom JWT auth works

1. **Admins** live in the `admins` table. Passwords are stored only as **bcrypt hashes** (cost 12); a `CHECK` constraint rejects anything that isn't a bcrypt hash.
2. **Login** (`POST /api/auth/login`): the email is looked up case-insensitively and `bcrypt.compare` checks the password. Unknown emails still run a bcrypt comparison and get the same `401` message, so attackers can't tell which emails exist. Failed attempts are rate-limited (10 per 15 min per IP).
3. **Token:** on success the server signs a JWT with **HS256** containing `sub` (admin id), `email`, `jti` (unique token id), `iat`, `exp` (8 h), `iss` and `aud`. It is returned in the JSON body **and** set as an `httpOnly`, `SameSite=Lax` (and `Secure` in production) cookie.
4. **Protected routes:** `requireAdmin` runs before every `/api/admin/*` handler. It accepts the token from `Authorization: Bearer <jwt>` (API clients) or the cookie (the dashboard), verifies the signature with the algorithm **pinned to HS256** (blocks `alg: none` and algorithm-confusion tricks), checks expiry, issuer and audience, then, in one query, confirms the admin still exists and the token hasn't been logged out. Deleting an admin locks out their old tokens immediately.
5. **Logout** revokes that exact token: its `jti` goes into `revoked_tokens`, the middleware rejects it from then on (other sessions stay logged in), and the cookie is cleared.

### Test it with curl

Replace `BASE` with `http://localhost:4000` (or the live backend URL).

```bash
BASE=http://localhost:4000

# 1. Protected route without a token -> 401
curl -i $BASE/api/admin/inquiries

# 2. Wrong password -> 401 {"error":"Incorrect email or password."}
curl -i -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"wrong"}'

# 3. Log in -> 200 with {"token": "...", "expiresAt": "...", "admin": {...}}
curl -s -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"a-strong-password"}'

# 4. Use the token
TOKEN=paste-the-token-here
curl -s "$BASE/api/admin/inquiries?category=scholarship&userType=parent&q=riya" \
  -H "Authorization: Bearer $TOKEN"

# 5. Tamper with the token (change one character) -> 401 "Invalid session"
curl -i $BASE/api/auth/me -H "Authorization: Bearer ${TOKEN}x"

# 6. Log out, then reuse the same token -> 401 "You have logged out"
curl -i -X POST $BASE/api/auth/logout -H "Authorization: Bearer $TOKEN"
curl -i $BASE/api/auth/me -H "Authorization: Bearer $TOKEN"
```

On Windows PowerShell, use `curl.exe` and put the JSON in a file (`-d "@login.json"`), or use Postman / Thunder Client. Pasting the token into [jwt.io](https://jwt.io) shows its claims (`sub`, `email`, `jti`, `iat`, `exp`, `iss`, `aud`) and that it carries no password data.

In the browser: open `/admin` while logged out and you are sent to the login page; DevTools → Application → Cookies shows `crm_token` flagged **HttpOnly** (page JavaScript can't read it).

### Automated tests

```bash
cd backend
npm test
```

20 tests run against a real, throwaway PostgreSQL in a UTC session like Supabase's (no setup needed). They cover: form validation and storage; the honeypot; database `CHECK` constraints; identical `401`s for wrong password and unknown email; JWT claims and cookie flags; rejection of missing, forged, expired, `alg: none`, garbage and `jti`-less tokens; Bearer and cookie both working; logout revoking a copied token but not other sessions; deleted admins being locked out; bcrypt-only password storage; pagination; category, user type and combined filters; date filters on Indian calendar days and impossible dates; name, phone and reference-number search; `%`/`_` treated literally in search; status changes and notes on the timeline; stats; CSV export and its formula-injection escaping.

---

## API reference

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | none | API + database check |
| `POST` | `/api/inquiries` | none | submit an inquiry → `201 { inquiry: { ref, createdAt } }` |
| `POST` | `/api/auth/login` | none | `{ email, password }` → `{ token, tokenType, expiresAt, admin }` + cookie |
| `POST` | `/api/auth/logout` | token | revokes the token and clears the cookie → `204` |
| `GET` | `/api/auth/me` | admin | current admin |
| `GET` | `/api/admin/inquiries` | admin | list. Query: `category`, `userType`, `status`, `q`, `from`, `to` (YYYY-MM-DD, IST), `sort` (`newest`/`oldest`/`name`), `page`, `pageSize` (≤100) |
| `GET` | `/api/admin/inquiries/stats` | admin | counts for the dashboard cards |
| `GET` | `/api/admin/inquiries/export.csv` | admin | CSV of the filtered list |
| `GET` | `/api/admin/inquiries/:id` | admin | one inquiry + activity timeline |
| `PATCH` | `/api/admin/inquiries/:id` | admin | `{ status }` |
| `POST` | `/api/admin/inquiries/:id/notes` | admin | `{ note }` |

Errors are always JSON: `{ "error": "message", "fields": { "email": "Enter a valid email address." } }`.

Inquiry body for `POST /api/inquiries`:

```json
{
  "userType": "parent",
  "category": "admission",
  "name": "Riya Sharma",
  "email": "riya@example.com",
  "phone": "+91 98765 43210",
  "message": "What is the admission process for Class 11 Science?"
}
```

`userType` ∈ `parent | student | school`; `category` ∈ `scholarship | concert | admission | general`.

---

## Database

See [`schema.sql`](schema.sql). Four tables:

- **`admins`**: `id`, `email` (unique, case-insensitive), `name`, `password_hash` (bcrypt only), `created_at`, `last_login_at`
- **`inquiries`**: `id`, `ref_no` (identity, shown as `INQ-00042`), `user_type`, `category`, `name`, `email`, `phone` (normalised to `+` and digits), `message`, `status`, `created_at`, `updated_at` (kept current by a trigger)
- **`inquiry_events`**: status changes and notes, linked to the inquiry and the admin
- **`revoked_tokens`**: logged-out JWT ids (`jti`) until they expire

Allowed values are enforced with `CHECK` constraints, so bad data can't get in even if someone bypasses the API. Indexes cover the dashboard's sort and filters, and `pg_trgm` GIN indexes keep the `ILIKE` name/phone search fast as the table grows.

**Supabase-specific:** Supabase automatically exposes the `public` schema through its REST API using the public anon key. The schema turns on **Row Level Security with no policies** for every table and also revokes the default `anon`/`authenticated` privileges, so that API can read nothing; only this backend (connecting as the database owner) can touch the data.

---

## Deploying (Vercel)

Two Vercel projects from this one repository:

1. **Backend:** New Project → import the repo → **Root Directory: `backend`** → Framework preset: *Other* → add environment variables `DATABASE_URL` (Supabase **transaction pooler**, port 6543), `JWT_SECRET`, `JWT_EXPIRES_IN=8h` → Deploy. Check `https://<backend>.vercel.app/api/health`.
2. **Frontend:** set the backend URL in [`frontend/vercel.json`](frontend/vercel.json) (the `/api/:path*` rewrite destination) and push. New Project → same repo → **Root Directory: `frontend`** → preset *Vite* → optionally add `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD` → Deploy.

The transaction pooler suits serverless functions, which open many short-lived connections; each function instance keeps a pool of at most 3. [`backend/vercel.json`](backend/vercel.json) pins the function to Mumbai (`bom1`); change it if your Supabase project is in another region, since every query crosses that distance.

Both projects are connected to this GitHub repository, so every push to `main` redeploys them automatically (each project builds only its own Root Directory).

---

## Security notes

- Parameterised SQL everywhere (`$1, $2…`); the search escapes `%` and `_`.
- Input validated with zod on the server and again by database constraints.
- JWT: HS256 pinned, issuer/audience checked, short expiry, per-token revocation on logout, httpOnly cookie, admin re-checked on every request.
- `helmet` security headers, `Cache-Control: no-store` on API responses, JSON body limit of 20 kB.
- Rate limits on login and the public form; honeypot field for bots.
- Error handler never leaks stack traces or SQL errors to clients.
- CSV export prefixes cells that start with `= + - @` so spreadsheets don't execute them.

### Known trade-offs

- Rate limits use in-memory counters, which on serverless are per function instance. A shared store (Redis/Upstash) would make them global.
- The demo admin account is public on the live site, so anyone can change statuses there.
- The database connection is encrypted (TLS) but doesn't pin Supabase's CA certificate.
- CSV phone numbers that start with `+` get a leading `'` (formula-injection guard), which Excel shows as text.

---

Built by **Aayush Thakur** for the K12 Hunar Full-Stack Developer Intern assessment.
