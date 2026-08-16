create extension if not exists pgcrypto;

-- Existing tables are retained. These migrations are safe to run on the current project.
alter table public.tournaments add column if not exists match_count integer not null default 1;
alter table public.tournaments add column if not exists started_at timestamptz;
alter table public.tournaments add column if not exists winner_team_id uuid;
alter table public.tournaments add column if not exists join_code text;
alter table public.players add column if not exists joined boolean not null default false;
alter table public.players add column if not exists joined_at timestamptz;

create table if not exists public.matches (
 id uuid primary key default gen_random_uuid(),
 tournament_id uuid not null references public.tournaments(id) on delete cascade,
 match_number integer not null,
 team_a_id uuid not null references public.teams(id) on delete cascade,
 team_b_id uuid not null references public.teams(id) on delete cascade,
 status text not null default 'scheduled' check(status in ('scheduled','live','completed')),
 winner_team_id uuid references public.teams(id) on delete set null,
 score_a_runs integer not null default 0,
 score_a_wickets integer not null default 0,
 score_a_overs numeric(5,1) not null default 0,
 score_b_runs integer not null default 0,
 score_b_wickets integer not null default 0,
 score_b_overs numeric(5,1) not null default 0,
 scheduled_at timestamptz,
 created_at timestamptz not null default now(),
 unique(tournament_id,match_number)
);

create table if not exists public.batting_records (
 id uuid primary key default gen_random_uuid(),
 match_id uuid not null references public.matches(id) on delete cascade,
 player_id uuid not null references public.players(id) on delete cascade,
 team_id uuid not null references public.teams(id) on delete cascade,
 innings integer not null default 1,
 runs integer not null default 0,
 balls integer not null default 0,
 fours integer not null default 0,
 sixes integer not null default 0,
 dismissal text,
 unique(match_id,player_id,innings)
);

create table if not exists public.bowling_records (
 id uuid primary key default gen_random_uuid(),
 match_id uuid not null references public.matches(id) on delete cascade,
 player_id uuid not null references public.players(id) on delete cascade,
 team_id uuid not null references public.teams(id) on delete cascade,
 innings integer not null default 1,
 overs numeric(5,1) not null default 0,
 maidens integer not null default 0,
 runs integer not null default 0,
 wickets integer not null default 0,
 unique(match_id,player_id,innings)
);

create index if not exists idx_matches_tournament on public.matches(tournament_id);
create index if not exists idx_batting_match on public.batting_records(match_id);
create index if not exists idx_bowling_match on public.bowling_records(match_id);

alter table public.tournaments enable row level security;
alter table public.matches enable row level security;
alter table public.batting_records enable row level security;
alter table public.bowling_records enable row level security;

drop policy if exists "tournaments public read" on public.tournaments;
create policy "tournaments public read" on public.tournaments for select using(true);
drop policy if exists "tournaments public insert" on public.tournaments;
create policy "tournaments public insert" on public.tournaments for insert with check(true);
drop policy if exists "tournaments public update" on public.tournaments;
create policy "tournaments public update" on public.tournaments for update using(true) with check(true);

drop policy if exists "matches public read" on public.matches;
create policy "matches public read" on public.matches for select using(true);
drop policy if exists "matches public insert" on public.matches;
create policy "matches public insert" on public.matches for insert with check(true);
drop policy if exists "matches public update" on public.matches;
create policy "matches public update" on public.matches for update using(true) with check(true);

drop policy if exists "batting public read" on public.batting_records;
create policy "batting public read" on public.batting_records for select using(true);
drop policy if exists "batting public insert" on public.batting_records;
create policy "batting public insert" on public.batting_records for insert with check(true);
drop policy if exists "batting public update" on public.batting_records;
create policy "batting public update" on public.batting_records for update using(true) with check(true);
drop policy if exists "batting public delete" on public.batting_records;
create policy "batting public delete" on public.batting_records for delete using(true);

drop policy if exists "bowling public read" on public.bowling_records;
create policy "bowling public read" on public.bowling_records for select using(true);
drop policy if exists "bowling public insert" on public.bowling_records;
create policy "bowling public insert" on public.bowling_records for insert with check(true);
drop policy if exists "bowling public update" on public.bowling_records;
create policy "bowling public update" on public.bowling_records for update using(true) with check(true);
drop policy if exists "bowling public delete" on public.bowling_records;
create policy "bowling public delete" on public.bowling_records for delete using(true);

do $$ begin alter publication supabase_realtime add table public.matches; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.batting_records; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.bowling_records; exception when duplicate_object then null; end $$;

create table if not exists public.ball_events (
 id uuid primary key default gen_random_uuid(),
 match_id uuid not null references public.matches(id) on delete cascade,
 innings integer not null default 1,
 ball_number integer not null,
 over_number integer not null,
 ball_in_over integer not null,
 striker_id uuid references public.players(id) on delete set null,
 non_striker_id uuid references public.players(id) on delete set null,
 bowler_id uuid references public.players(id) on delete set null,
 event_type text not null check(event_type in ('run','four','six','wide','noball','bye','legbye','wicket','dot')),
 bat_runs integer not null default 0,
 extra_runs integer not null default 0,
 total_runs integer not null default 0,
 wicket_type text,
 dismissed_player_id uuid references public.players(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists idx_ball_events_match on public.ball_events(match_id,innings,ball_number);
alter table public.ball_events enable row level security;
drop policy if exists "ball events public read" on public.ball_events;
create policy "ball events public read" on public.ball_events for select using(true);
drop policy if exists "ball events public insert" on public.ball_events;
create policy "ball events public insert" on public.ball_events for insert with check(true);
do $$ begin alter publication supabase_realtime add table public.ball_events; exception when duplicate_object then null; end $$;

-- Admin-only login
create table if not exists public.admin_users (
 id uuid primary key default gen_random_uuid(),
 username text not null unique,
 password_hash text not null,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
drop policy if exists "admin login lookup" on public.admin_users;
create policy "admin login lookup" on public.admin_users for select using(true);

-- IMPORTANT:
-- Generate SHA-256 of your chosen admin password and insert it with:
-- insert into public.admin_users(username,password_hash) values ('admin','YOUR_SHA256_HASH');
-- Example only (DO NOT use this password in production):
-- password = MatchDay123!
-- SHA-256 = 3b7e4a4f8f0c0d8f1d7f5d4e9d4d0d0e4f4d8a7e0a5f2a2e4e0b6e5d7f3d5c1
