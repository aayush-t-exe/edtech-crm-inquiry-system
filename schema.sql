-- EdTech CRM & Inquiry System: database schema
-- Target: Supabase (PostgreSQL 15+). Safe to run more than once.
--
-- Run it in the Supabase SQL editor, or with `npm run db:migrate` from /backend.

create extension if not exists pg_trgm;   -- fast ILIKE search on name / phone

-- ---------------------------------------------------------------------------
-- admins: people who can log in to the dashboard.
-- Passwords are stored only as bcrypt hashes (never plain text).
-- ---------------------------------------------------------------------------
create table if not exists admins (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  name          text not null default 'Admin',
  password_hash text not null,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz,
  constraint admins_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint admins_hash_is_bcrypt check (password_hash ~ '^\$2[aby]\$\d{2}\$.{53}$')
);

-- one account per email, case-insensitive
create unique index if not exists admins_email_lower_key on admins (lower(email));

-- ---------------------------------------------------------------------------
-- inquiries: everything submitted through the public form.
-- ---------------------------------------------------------------------------
create table if not exists inquiries (
  id         uuid primary key default gen_random_uuid(),
  ref_no     bigint generated always as identity unique,   -- shown as INQ-00042
  user_type  text not null,
  category   text not null,
  name       text not null,
  email      text not null,
  phone      text not null,                                -- stored normalised: optional "+", then digits
  message    text not null,
  status     text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inquiries_user_type_valid check (user_type in ('parent', 'student', 'school')),
  constraint inquiries_category_valid  check (category in ('scholarship', 'concert', 'admission', 'general')),
  constraint inquiries_status_valid    check (status in ('new', 'contacted', 'in_progress', 'resolved', 'closed')),
  constraint inquiries_name_length     check (char_length(btrim(name)) between 2 and 100),
  constraint inquiries_email_format    check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  constraint inquiries_phone_format    check (phone ~ '^\+?[0-9]{7,15}$'),
  constraint inquiries_message_length  check (char_length(btrim(message)) between 10 and 2000)
);

-- the dashboard sorts by newest and filters by these columns
create index if not exists inquiries_created_at_idx on inquiries (created_at desc);
create index if not exists inquiries_category_idx   on inquiries (category);
create index if not exists inquiries_user_type_idx  on inquiries (user_type);
create index if not exists inquiries_status_idx     on inquiries (status);
-- trigram indexes make "search by name or phone" (ILIKE '%term%') use an index
create index if not exists inquiries_name_trgm_idx  on inquiries using gin (name gin_trgm_ops);
create index if not exists inquiries_phone_trgm_idx on inquiries using gin (phone gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- inquiry_events: the activity timeline (status changes and internal notes).
-- ---------------------------------------------------------------------------
create table if not exists inquiry_events (
  id          uuid primary key default gen_random_uuid(),
  inquiry_id  uuid not null references inquiries (id) on delete cascade,
  admin_id    uuid references admins (id) on delete set null,
  kind        text not null,
  from_status text,
  to_status   text,
  note        text,
  created_at  timestamptz not null default now(),

  constraint inquiry_events_kind_valid check (kind in ('status_change', 'note')),
  constraint inquiry_events_note_length check (note is null or char_length(btrim(note)) between 1 and 1000)
);

create index if not exists inquiry_events_inquiry_idx on inquiry_events (inquiry_id, created_at);

-- ---------------------------------------------------------------------------
-- revoked_tokens: JWTs that were logged out before they expired.
-- Each token carries a unique id (jti); logout stores it here and the auth
-- middleware rejects it from then on. Rows can be deleted once expires_at passes.
-- ---------------------------------------------------------------------------
create table if not exists revoked_tokens (
  jti        uuid primary key,
  admin_id   uuid references admins (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz not null default now()
);

create index if not exists revoked_tokens_expires_idx on revoked_tokens (expires_at);

-- keep updated_at honest
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists inquiries_set_updated_at on inquiries;
create trigger inquiries_set_updated_at
  before update on inquiries
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Lock the tables away from Supabase's public REST API.
-- Supabase exposes the `public` schema through PostgREST using the anon key.
-- With RLS on and no policies, the anon/authenticated roles can read nothing;
-- only our backend (connecting as the database owner) can touch these tables.
-- ---------------------------------------------------------------------------
alter table admins         enable row level security;
alter table inquiries      enable row level security;
alter table inquiry_events enable row level security;
alter table revoked_tokens enable row level security;

-- Belt and braces: also remove the default table privileges Supabase grants to its
-- API roles. (Skipped on plain PostgreSQL, where these roles don't exist.)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on admins, inquiries, inquiry_events, revoked_tokens from anon, authenticated;
  end if;
end;
$$;
