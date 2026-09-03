create table if not exists premium_sync (
  user_id text primary key references "user" ("id") on delete cascade,
  source_usernames jsonb not null
    check (jsonb_typeof(source_usernames) = 'array')
    check (jsonb_array_length(source_usernames) between 1 and 8),
  start_date date not null,
  repo text not null check (length(repo) between 1 and 100),
  commit_name text not null check (length(commit_name) between 1 and 100),
  commit_email text not null,
  intensity text not null check (intensity in ('days', 'levels', 'counts')),
  is_private boolean not null default true,
  enabled boolean not null default true,
  disabled_reason text check (disabled_reason in ('user', 'subscription')),
  revision integer not null default 1 check (revision > 0),
  needs_reconcile boolean not null default true,
  next_sync_at timestamptz not null default current_timestamp,
  lease_until timestamptz,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists premium_sync_due_idx
  on premium_sync (next_sync_at)
  where enabled;

create table if not exists premium_sync_day (
  user_id text not null references premium_sync (user_id) on delete cascade,
  day date not null,
  copied_commits integer not null check (copied_commits >= 0),
  updated_at timestamptz not null default current_timestamp,
  primary key (user_id, day)
);
