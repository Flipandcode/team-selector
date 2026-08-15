-- TurfDraft production schema
create extension if not exists pgcrypto;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  name text not null,
  status text not null default 'drafting' check (status in ('drafting','complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  captain text not null,
  draft_order integer not null,
  created_at timestamptz not null default now(),
  unique(tournament_id,name),
  unique(tournament_id,draft_order)
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  picked_by_team uuid references public.teams(id) on delete set null,
  pick_number integer,
  created_at timestamptz not null default now(),
  unique(tournament_id,name),
  unique(tournament_id,pick_number)
);

create table if not exists public.draft_picks (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  pick_number integer not null,
  created_at timestamptz not null default now(),
  unique(tournament_id,pick_number),
  unique(player_id)
);

create index if not exists idx_teams_tournament on public.teams(tournament_id);
create index if not exists idx_players_tournament on public.players(tournament_id);
create index if not exists idx_picks_tournament on public.draft_picks(tournament_id);

alter table public.tournaments enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.draft_picks enable row level security;

drop policy if exists "tournaments public read" on public.tournaments;
create policy "tournaments public read" on public.tournaments for select using (true);
drop policy if exists "tournaments public insert" on public.tournaments;
create policy "tournaments public insert" on public.tournaments for insert with check (true);
drop policy if exists "tournaments public update" on public.tournaments;
create policy "tournaments public update" on public.tournaments for update using (true) with check (true);

drop policy if exists "teams public read" on public.teams;
create policy "teams public read" on public.teams for select using (true);
drop policy if exists "teams public insert" on public.teams;
create policy "teams public insert" on public.teams for insert with check (true);
drop policy if exists "teams public update" on public.teams;
create policy "teams public update" on public.teams for update using (true) with check (true);

drop policy if exists "players public read" on public.players;
create policy "players public read" on public.players for select using (true);
drop policy if exists "players public insert" on public.players;
create policy "players public insert" on public.players for insert with check (true);
drop policy if exists "players public update" on public.players;
create policy "players public update" on public.players for update using (true) with check (true);

drop policy if exists "picks public read" on public.draft_picks;
create policy "picks public read" on public.draft_picks for select using (true);
drop policy if exists "picks public insert" on public.draft_picks;
create policy "picks public insert" on public.draft_picks for insert with check (true);
drop policy if exists "picks public delete" on public.draft_picks;
create policy "picks public delete" on public.draft_picks for delete using (true);

-- Realtime publication. If a table is already present, these statements are harmless.
do $$
begin
  alter publication supabase_realtime add table public.tournaments;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.teams;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.players;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.draft_picks;
exception when duplicate_object then null;
end $$;
