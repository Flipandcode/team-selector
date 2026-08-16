
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
