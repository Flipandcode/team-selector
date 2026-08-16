
-- ============================================================
-- MATCHDAY v5.1 SAFE MIGRATION
-- Existing data is preserved.
--
-- This migration supports the old admin_users table from v3/v4,
-- where the table may contain username/password_hash, and safely
-- adds Supabase Auth linkage without assuming user_id exists.
--
-- BEFORE RUNNING:
-- 1) Create your admin user in Supabase Dashboard > Authentication > Users.
-- 2) Copy that Auth user's UUID.
-- 3) Replace the value below.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Preserve the existing admin_users table and add auth linkage
-- ------------------------------------------------------------
alter table if exists public.admin_users
  add column if not exists auth_user_id uuid;

alter table if exists public.admin_users
  add column if not exists active boolean not null default true;

-- Link the existing row to the Supabase Auth user.
-- IMPORTANT: replace the UUID below with your Supabase Auth user's UUID.
-- If you have not created the Auth user yet, leave this UPDATE commented
-- and run it after creating the user.
--
-- update public.admin_users
-- set auth_user_id = 'PASTE-SUPABASE-AUTH-USER-UUID-HERE'
-- where lower(username) = 'admin';

-- Add FK only if it does not already exist.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_auth_user_id_fkey'
      and conrelid = 'public.admin_users'::regclass
  ) then
    alter table public.admin_users
      add constraint admin_users_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

create unique index if not exists admin_users_auth_user_id_uidx
  on public.admin_users(auth_user_id)
  where auth_user_id is not null;

alter table public.admin_users enable row level security;

drop policy if exists "admin login lookup" on public.admin_users;
drop policy if exists "admin can read own row" on public.admin_users;

create policy "admin can read own row"
on public.admin_users
for select
to authenticated
using (auth_user_id = auth.uid() and active = true);

-- ------------------------------------------------------------
-- 2. Admin helper
-- ------------------------------------------------------------
create or replace function public.is_matchday_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where auth_user_id = auth.uid()
      and active = true
  );
$$;

-- ------------------------------------------------------------
-- 3. Public player join RPC
-- Players do not need a Supabase Auth account.
-- This performs only the controlled "joined=true" update.
-- ------------------------------------------------------------
create or replace function public.join_tournament_player(
  p_tournament_id uuid,
  p_player_name text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.players;
begin
  select *
  into p
  from public.players
  where tournament_id = p_tournament_id
    and lower(trim(name)) = lower(trim(p_player_name))
  limit 1;

  if p.id is null then
    raise exception 'Player not found in this tournament';
  end if;

  if p.joined then
    raise exception 'Player already joined';
  end if;

  update public.players
  set joined = true
  where id = p.id
    and joined = false;

  if not found then
    raise exception 'Player was already joined';
  end if;

  return json_build_object(
    'id', p.id,
    'name', p.name
  );
end;
$$;

revoke all on function public.join_tournament_player(uuid,text) from public;
grant execute on function public.join_tournament_player(uuid,text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Ensure RLS is enabled on protected tables
-- ------------------------------------------------------------
alter table if exists public.tournaments enable row level security;
alter table if exists public.teams enable row level security;
alter table if exists public.players enable row level security;
alter table if exists public.matches enable row level security;
alter table if exists public.batting_records enable row level security;
alter table if exists public.bowling_records enable row level security;
alter table if exists public.ball_events enable row level security;

-- ------------------------------------------------------------
-- 5. Drop ONLY write policies on protected tournament/scoring tables.
-- SELECT policies are intentionally retained.
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'tournaments',
        'teams',
        'players',
        'matches',
        'batting_records',
        'bowling_records',
        'ball_events'
      )
      and cmd in ('INSERT','UPDATE','DELETE')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      r.policyname,
      r.tablename
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- 6. Admin-only writes
-- ------------------------------------------------------------
do $$
begin

  if to_regclass('public.tournaments') is not null then
    create policy "matchday admin insert tournaments"
    on public.tournaments for insert to authenticated
    with check (public.is_matchday_admin());

    create policy "matchday admin update tournaments"
    on public.tournaments for update to authenticated
    using (public.is_matchday_admin())
    with check (public.is_matchday_admin());

    create policy "matchday admin delete tournaments"
    on public.tournaments for delete to authenticated
    using (public.is_matchday_admin());
  end if;

  if to_regclass('public.teams') is not null then
    create policy "matchday admin insert teams"
    on public.teams for insert to authenticated
    with check (public.is_matchday_admin());

    create policy "matchday admin update teams"
    on public.teams for update to authenticated
    using (public.is_matchday_admin())
    with check (public.is_matchday_admin());

    create policy "matchday admin delete teams"
    on public.teams for delete to authenticated
    using (public.is_matchday_admin());
  end if;

  if to_regclass('public.players') is not null then
    create policy "matchday admin insert players"
    on public.players for insert to authenticated
    with check (public.is_matchday_admin());

    create policy "matchday admin update players"
    on public.players for update to authenticated
    using (public.is_matchday_admin())
    with check (public.is_matchday_admin());

    create policy "matchday admin delete players"
    on public.players for delete to authenticated
    using (public.is_matchday_admin());
  end if;

  if to_regclass('public.matches') is not null then
    create policy "matchday admin insert matches"
    on public.matches for insert to authenticated
    with check (public.is_matchday_admin());

    create policy "matchday admin update matches"
    on public.matches for update to authenticated
    using (public.is_matchday_admin())
    with check (public.is_matchday_admin());

    create policy "matchday admin delete matches"
    on public.matches for delete to authenticated
    using (public.is_matchday_admin());
  end if;

  if to_regclass('public.batting_records') is not null then
    create policy "matchday admin insert batting"
    on public.batting_records for insert to authenticated
    with check (public.is_matchday_admin());

    create policy "matchday admin update batting"
    on public.batting_records for update to authenticated
    using (public.is_matchday_admin())
    with check (public.is_matchday_admin());

    create policy "matchday admin delete batting"
    on public.batting_records for delete to authenticated
    using (public.is_matchday_admin());
  end if;

  if to_regclass('public.bowling_records') is not null then
    create policy "matchday admin insert bowling"
    on public.bowling_records for insert to authenticated
    with check (public.is_matchday_admin());

    create policy "matchday admin update bowling"
    on public.bowling_records for update to authenticated
    using (public.is_matchday_admin())
    with check (public.is_matchday_admin());

    create policy "matchday admin delete bowling"
    on public.bowling_records for delete to authenticated
    using (public.is_matchday_admin());
  end if;

  if to_regclass('public.ball_events') is not null then
    create policy "matchday admin insert ball events"
    on public.ball_events for insert to authenticated
    with check (public.is_matchday_admin());

    create policy "matchday admin update ball events"
    on public.ball_events for update to authenticated
    using (public.is_matchday_admin())
    with check (public.is_matchday_admin());

    create policy "matchday admin delete ball events"
    on public.ball_events for delete to authenticated
    using (public.is_matchday_admin());
  end if;

end $$;

commit;

-- ============================================================
-- AFTER RUNNING THE MIGRATION:
--
-- 1. Supabase Dashboard -> Authentication -> Users
--    Create your admin email/password user.
--
-- 2. Copy that user's UUID.
--
-- 3. Run ONLY this statement, replacing the UUID:
--
-- update public.admin_users
-- set auth_user_id = 'YOUR-AUTH-USER-UUID',
--     active = true
-- where lower(username) = 'admin';
--
-- If your old admin username is not "admin", use the correct username.
--
-- If there is no old admin row, use:
--
-- insert into public.admin_users (auth_user_id, active)
-- values ('YOUR-AUTH-USER-UUID', true)
-- on conflict (auth_user_id)
-- do update set active = true;
--
-- IMPORTANT:
-- Do not store a Supabase service-role key in the frontend.
-- ============================================================


-- ============================================================
-- MATCHDAY DRAFT / TEAM ASSIGNMENT MIGRATION
-- Safe to run on an existing database.
-- ============================================================

begin;

-- A player's final team is persisted here. Captains are assigned to
-- their configured team when they join; non-captains are assigned by draft.
alter table if exists public.players
  add column if not exists team_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'players_team_id_fkey'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_team_id_fkey
      foreign key (team_id) references public.teams(id) on delete set null;
  end if;
end $$;

create index if not exists players_tournament_team_idx
  on public.players(tournament_id, team_id);

-- Persistent state for the alternating captain draft.
create table if not exists public.tournament_draft_state (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  current_team_id uuid references public.teams(id) on delete set null,
  pick_number integer not null default 1,
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.draft_selections (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  captain_player_id uuid not null references public.players(id) on delete restrict,
  pick_number integer not null,
  created_at timestamptz not null default now(),
  unique (tournament_id, player_id),
  unique (tournament_id, pick_number)
);

create index if not exists draft_selections_tournament_idx
  on public.draft_selections(tournament_id, pick_number);

alter table public.tournament_draft_state enable row level security;
alter table public.draft_selections enable row level security;

drop policy if exists "draft state public read" on public.tournament_draft_state;
create policy "draft state public read"
on public.tournament_draft_state for select to anon, authenticated
using (true);

drop policy if exists "draft selections public read" on public.draft_selections;
create policy "draft selections public read"
on public.draft_selections for select to anon, authenticated
using (true);

-- Admins may maintain these tables directly if required.
drop policy if exists "draft state admin write" on public.tournament_draft_state;
create policy "draft state admin write"
on public.tournament_draft_state for all to authenticated
using (public.is_matchday_admin())
with check (public.is_matchday_admin());

drop policy if exists "draft selections admin write" on public.draft_selections;
create policy "draft selections admin write"
on public.draft_selections for all to authenticated
using (public.is_matchday_admin())
with check (public.is_matchday_admin());

-- Captain-aware player join. This is deliberately a SECURITY DEFINER RPC so
-- anonymous players can join without getting general UPDATE access to players.
create or replace function public.join_tournament_player(
  p_tournament_id uuid,
  p_player_name text,
  p_team_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.players;
  t public.teams;
  captain_match boolean := false;
begin
  select * into p
  from public.players
  where tournament_id = p_tournament_id
    and lower(trim(name)) = lower(trim(p_player_name))
  limit 1;

  if p.id is null then
    raise exception 'Player not found in this tournament';
  end if;
  if p.joined then
    raise exception 'Player already joined';
  end if;

  select * into t
  from public.teams
  where tournament_id = p_tournament_id
    and lower(trim(captain)) = lower(trim(p.name))
  limit 1;

  captain_match := t.id is not null;

  if captain_match then
    if p_team_id is null then
      raise exception 'Captain team must be selected';
    end if;
    if p_team_id <> t.id then
      raise exception 'Captain can only join the team assigned to them';
    end if;
  elsif p_team_id is not null then
    raise exception 'Players receive their team through the captain draft';
  end if;

  update public.players
  set joined = true,
      team_id = case when captain_match then t.id else null end
  where id = p.id
    and joined = false;

  if not found then
    raise exception 'Player was already joined';
  end if;

  return json_build_object(
    'id', p.id,
    'name', p.name,
    'team_id', case when captain_match then t.id else null end,
    'is_captain', captain_match
  );
end;
$$;

revoke all on function public.join_tournament_player(uuid,text) from public;
revoke all on function public.join_tournament_player(uuid,text,uuid) from public;
grant execute on function public.join_tournament_player(uuid,text) to anon, authenticated;
grant execute on function public.join_tournament_player(uuid,text,uuid) to anon, authenticated;

-- Initialise draft state for existing tournaments. The first configured team
-- starts. Existing captain rows are assigned to their configured team.
insert into public.tournament_draft_state(tournament_id, current_team_id, pick_number, completed)
select t.id,
       (select tm.id from public.teams tm where tm.tournament_id=t.id order by tm.draft_order nulls last, tm.id limit 1),
       1,
       false
from public.tournaments t
where exists (select 1 from public.teams tm where tm.tournament_id=t.id)
on conflict (tournament_id) do nothing;

update public.players p
set team_id = tm.id
from public.teams tm
where p.tournament_id = tm.tournament_id
  and lower(trim(p.name)) = lower(trim(tm.captain))
  and p.team_id is null;

-- Secure captain-only, turn-enforced draft pick.
-- Players only need to exist in the tournament roster; they do not need to join before a captain drafts them.
create or replace function public.draft_pick_player(
  p_tournament_id uuid,
  p_captain_player_id uuid,
  p_player_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  st public.tournament_draft_state;
  current_team public.teams;
  captain public.players;
  target public.players;
  next_team uuid;
  next_pick integer;
  remaining integer;
begin
  select * into st
  from public.tournament_draft_state
  where tournament_id=p_tournament_id
  for update;

  if st.tournament_id is null then
    raise exception 'Draft is not configured for this tournament';
  end if;
  if st.completed then
    raise exception 'Draft is already complete';
  end if;

  select * into current_team from public.teams where id=st.current_team_id and tournament_id=p_tournament_id;
  if current_team.id is null then raise exception 'Current draft team not found'; end if;

  select * into captain from public.players
  where id=p_captain_player_id and tournament_id=p_tournament_id;
  if captain.id is null then raise exception 'Captain not found'; end if;
  if not captain.joined then raise exception 'Captain must join before picking'; end if;
  if lower(trim(captain.name)) <> lower(trim(current_team.captain)) then
    raise exception 'It is not this captain''s turn';
  end if;
  if captain.team_id <> current_team.id then
    raise exception 'Captain is not assigned to the current team';
  end if;

  select * into target from public.players
  where id=p_player_id and tournament_id=p_tournament_id
  for update;
  if target.id is null then raise exception 'Player not found'; end if;
  if target.team_id is not null then raise exception 'Player has already been assigned to a team'; end if;
  if target.id = captain.id then raise exception 'Captain is already assigned to the team'; end if;

  update public.players set team_id=current_team.id where id=target.id;

  insert into public.draft_selections(tournament_id,player_id,team_id,captain_player_id,pick_number)
  values(p_tournament_id,target.id,current_team.id,captain.id,st.pick_number);

  select count(*) into remaining
  from public.players
  where tournament_id=p_tournament_id and team_id is null;

  if remaining=0 then
    update public.tournament_draft_state
    set completed=true, updated_at=now()
    where tournament_id=p_tournament_id;
  else
    select tm.id into next_team
    from public.teams tm
    where tm.tournament_id=p_tournament_id
      and tm.draft_order > current_team.draft_order
    order by tm.draft_order
    limit 1;

    if next_team is null then
      select tm.id into next_team
      from public.teams tm
      where tm.tournament_id=p_tournament_id
      order by tm.draft_order
      limit 1;
    end if;

    next_pick := st.pick_number + 1;
    update public.tournament_draft_state
    set current_team_id=next_team, pick_number=next_pick, updated_at=now()
    where tournament_id=p_tournament_id;
  end if;

  return json_build_object(
    'player_id', target.id,
    'player_name', target.name,
    'team_id', current_team.id,
    'pick_number', st.pick_number,
    'remaining', remaining
  );
end;
$$;

revoke all on function public.draft_pick_player(uuid,uuid,uuid) from public;
grant execute on function public.draft_pick_player(uuid,uuid,uuid) to anon, authenticated;

commit;
