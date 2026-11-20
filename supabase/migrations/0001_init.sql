-- LeadBooker schema. All access goes through the server with the service-role
-- key, so RLS is enabled with NO policies: anon/authenticated keys can read nothing.

create extension if not exists pgcrypto;

create table merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/New_York',
  description text not null default '',
  service_area text not null default '',
  goal text not null default 'in_home' check (goal in ('in_home', 'phone')),
  ai_instructions text not null default '',
  opening_message text not null default '',
  owner_notify_phone text,
  twilio_number text unique,
  twilio_number_sid text,
  webhook_secret text not null default encode(gen_random_bytes(24), 'hex'),
  widget_key text not null unique default encode(gen_random_bytes(12), 'hex'),
  widget_color text not null default '#2563eb',
  widget_greeting text not null default 'Hi! Want to get on our schedule? I can help with that.',
  calendar_api_key text,
  calendar_event_type_id text,
  calendar_event_type_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table faqs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  question text not null,
  answer text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on faqs (merchant_id, position);

create table qualifying_questions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  question text not null,
  required boolean not null default true,
  -- optional guidance, e.g. "If they rent, politely explain we only work with homeowners"
  guidance text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on qualifying_questions (merchant_id, position);

create table leads (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  name text,
  phone text,
  email text,
  address text,
  source text,
  notes text,
  raw jsonb not null default '{}',
  status text not null default 'new'
    check (status in ('new', 'engaged', 'booked', 'handoff', 'not_interested', 'opted_out')),
  created_at timestamptz not null default now()
);
create index on leads (merchant_id, created_at desc);
create index on leads (merchant_id, phone);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  channel text not null check (channel in ('sms', 'web', 'test')),
  session_id text,
  status text not null default 'open'
    check (status in ('open', 'booked', 'handoff', 'closed')),
  -- { name, email, phone, address, answers: { [question_id]: answer } }
  collected jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on conversations (merchant_id, updated_at desc);
create index on conversations (lead_id);
create unique index on conversations (merchant_id, session_id) where session_id is not null;

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on messages (conversation_id, created_at);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  type text not null check (type in ('in_home', 'phone')),
  start_time timestamptz not null,
  address text,
  provider text,
  provider_booking_id text,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);
create index on appointments (merchant_id, start_time);

alter table merchants enable row level security;
alter table faqs enable row level security;
alter table qualifying_questions enable row level security;
alter table leads enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table appointments enable row level security;
