begin;

-- ============================================================
-- MHLAPP - MATCH ENGINE V1
-- 2026-09-08
--
-- AMISTOSO:
--   jugador se anota -> reserved -> confirmed
--
-- COMPETENCIA:
--   coach convoca -> reserved -> confirmed/cancelled
--
-- PLANILLERO:
--   un planillero principal por partido.
--   al asignarlo recibe role planillero.
--   al quitarlo conserva el role.
--
-- FINANZAS:
--   deuda privada por match_player.
--   pagos como movimientos auditables.
-- ============================================================


-- ============================================================
-- 1. MATCHES
-- ============================================================

alter table public.matches
  add column if not exists player_price numeric(12,2);

alter table public.matches
  add column if not exists max_players integer;

alter table public.matches
  add column if not exists scorekeeper_user_id uuid;


do $$
begin

  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_player_price_check'
      and conrelid = 'public.matches'::regclass
  ) then

    alter table public.matches
      add constraint matches_player_price_check
      check (
        player_price is null
        or player_price >= 0
      );

  end if;


  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_max_players_check'
      and conrelid = 'public.matches'::regclass
  ) then

    alter table public.matches
      add constraint matches_max_players_check
      check (
        max_players is null
        or max_players > 0
      );

  end if;


  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_scorekeeper_user_id_fkey'
      and conrelid = 'public.matches'::regclass
  ) then

    alter table public.matches
      add constraint matches_scorekeeper_user_id_fkey
      foreign key (scorekeeper_user_id)
      references auth.users(id)
      on delete set null;

  end if;

end;
$$;


create index if not exists idx_matches_scorekeeper_user
on public.matches(scorekeeper_user_id)
where scorekeeper_user_id is not null;

create index if not exists idx_matches_status_scheduled
on public.matches(status, scheduled_at);



-- ============================================================
-- 2. MATCH PLAYERS - ASISTENCIA
-- ============================================================

alter table public.match_players
  add column if not exists attendance_status text
  not null default 'pending';


do $$
begin

  if not exists (
    select 1
    from pg_constraint
    where conname = 'match_players_attendance_status_check'
      and conrelid = 'public.match_players'::regclass
  ) then

    alter table public.match_players
      add constraint match_players_attendance_status_check
      check (
        attendance_status in (
          'pending',
          'present',
          'absent'
        )
      );

  end if;

end;
$$;


create index if not exists idx_match_players_match_participation
on public.match_players(match_id, participation_status);



-- ============================================================
-- 3. FINANZAS PRIVADAS DEL JUGADOR-PARTIDO
-- ============================================================

create table if not exists public.match_player_financials (

  match_player_id uuid primary key
    references public.match_players(id)
    on delete cascade,

  amount_due numeric(12,2) not null default 0
    check (amount_due >= 0),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);


alter table public.match_player_financials
enable row level security;



-- ============================================================
-- 4. MOVIMIENTOS DE PAGO
-- ============================================================

create table if not exists public.match_payments (

  id uuid primary key default gen_random_uuid(),

  match_player_id uuid not null
    references public.match_players(id)
    on delete cascade,

  kind text not null
    check (
      kind in (
        'payment',
        'waiver'
      )
    ),

  amount numeric(12,2) not null
    check (amount > 0),

  method text,

  note text,

  registered_by uuid not null
    references auth.users(id)
    on delete restrict,

  paid_at timestamptz not null default now(),

  voided_at timestamptz,

  voided_by uuid
    references auth.users(id)
    on delete set null,

  void_reason text,

  created_at timestamptz not null default now(),

  check (
    (
      kind = 'payment'
      and method is not null
    )
    or
    (
      kind = 'waiver'
      and method is null
    )
  )
);


create index if not exists idx_match_payments_match_player
on public.match_payments(match_player_id);

create index if not exists idx_match_payments_paid_at
on public.match_payments(paid_at desc);


alter table public.match_payments
enable row level security;



-- ============================================================
-- 5. QUITAR ACCESO DIRECTO DEL PLANILLERO
--
-- El planillero ya NO modifica cualquier partido.
-- Va a operar mediante RPC y solamente sobre su partido.
-- ============================================================

drop policy if exists
  "Scorekeepers update matches"
on public.matches;


drop policy if exists
  "Scorekeepers delete match players"
on public.match_players;

drop policy if exists
  "Scorekeepers insert match players"
on public.match_players;

drop policy if exists
  "Scorekeepers update match players"
on public.match_players;



-- ============================================================
-- 6. RLS FINANZAS
-- ============================================================

drop policy if exists
  "Admins read match player financials"
on public.match_player_financials;

create policy
  "Admins read match player financials"
on public.match_player_financials
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
);


drop policy if exists
  "Players read own match financials"
on public.match_player_financials;

create policy
  "Players read own match financials"
on public.match_player_financials
for select
to authenticated
using (
  exists (
    select 1
    from public.match_players mp
    join public.players p
      on p.id = mp.player_id
    where mp.id = match_player_financials.match_player_id
      and p.user_id = auth.uid()
  )
);


drop policy if exists
  "Assigned scorekeeper reads financials"
on public.match_player_financials;

create policy
  "Assigned scorekeeper reads financials"
on public.match_player_financials
for select
to authenticated
using (
  exists (
    select 1
    from public.match_players mp
    join public.matches m
      on m.id = mp.match_id
    where mp.id = match_player_financials.match_player_id
      and m.scorekeeper_user_id = auth.uid()
  )
);



drop policy if exists
  "Admins read match payments"
on public.match_payments;

create policy
  "Admins read match payments"
on public.match_payments
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
);


drop policy if exists
  "Players read own match payments"
on public.match_payments;

create policy
  "Players read own match payments"
on public.match_payments
for select
to authenticated
using (
  exists (
    select 1
    from public.match_players mp
    join public.players p
      on p.id = mp.player_id
    where mp.id = match_payments.match_player_id
      and p.user_id = auth.uid()
  )
);


drop policy if exists
  "Assigned scorekeeper reads match payments"
on public.match_payments;

create policy
  "Assigned scorekeeper reads match payments"
on public.match_payments
for select
to authenticated
using (
  exists (
    select 1
    from public.match_players mp
    join public.matches m
      on m.id = mp.match_id
    where mp.id = match_payments.match_player_id
      and m.scorekeeper_user_id = auth.uid()
  )
);


revoke all
on public.match_player_financials
from anon, authenticated;

revoke all
on public.match_payments
from anon, authenticated;

grant select
on public.match_player_financials
to authenticated;

grant select
on public.match_payments
to authenticated;



-- ============================================================
-- 7. HELPER: PUEDE OPERAR EL PARTIDO?
-- ============================================================

create or replace function public.can_operate_match(
  requested_match_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$

  select
    auth.uid() is not null
    and (
      public.has_role(auth.uid(), 'admin')
      or exists (
        select 1
        from public.matches m
        where m.id = requested_match_id
          and m.scorekeeper_user_id = auth.uid()
      )
    );

$$;


revoke all
on function public.can_operate_match(uuid)
from public;

grant execute
on function public.can_operate_match(uuid)
to authenticated;



-- ============================================================
-- 8. ADMIN - CREAR PARTIDO
-- ============================================================

create or replace function public.create_match_v1(

  requested_match_type text,

  requested_scheduled_at timestamptz,

  requested_player_price numeric,

  requested_venue_name text default null,

  requested_pitch text default null,

  requested_max_players integer default null,

  requested_competition_id uuid default null,

  requested_home_team_id uuid default null,

  requested_away_team_id uuid default null,

  requested_matchday integer default null,

  requested_phase text default null,

  requested_zone text default null,

  requested_match_number integer default null

)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare

  current_admin_id uuid := auth.uid();

  normalized_type text :=
    lower(trim(requested_match_type));

  new_match_id uuid;

begin

  if current_admin_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  if not public.has_role(current_admin_id, 'admin') then
    raise exception 'ADMIN_REQUIRED';
  end if;


  if normalized_type not in (
    'friendly',
    'competition'
  ) then
    raise exception 'INVALID_MATCH_TYPE';
  end if;


  if requested_scheduled_at is null then
    raise exception 'SCHEDULE_REQUIRED';
  end if;


  if requested_player_price is null
     or requested_player_price < 0 then
    raise exception 'INVALID_PLAYER_PRICE';
  end if;


  if normalized_type = 'friendly' then

    if requested_competition_id is not null then
      raise exception 'FRIENDLY_CANNOT_HAVE_COMPETITION';
    end if;


    if requested_max_players is null
       or requested_max_players <= 0 then
      raise exception 'FRIENDLY_MAX_PLAYERS_REQUIRED';
    end if;

  end if;


  if normalized_type = 'competition' then

    if requested_competition_id is null then
      raise exception 'COMPETITION_REQUIRED';
    end if;


    if requested_home_team_id is null
       or requested_away_team_id is null then
      raise exception 'COMPETITION_TEAMS_REQUIRED';
    end if;


    if requested_home_team_id =
       requested_away_team_id then
      raise exception 'MATCH_TEAMS_MUST_BE_DIFFERENT';
    end if;

  end if;


  insert into public.matches (

    match_type,

    competition_id,

    home_team_id,

    away_team_id,

    scheduled_at,

    venue_name,

    pitch,

    status,

    player_price,

    max_players,

    created_by,

    matchday,

    phase,

    zone,

    match_number

  )
  values (

    normalized_type,

    requested_competition_id,

    requested_home_team_id,

    requested_away_team_id,

    requested_scheduled_at,

    nullif(trim(requested_venue_name), ''),

    nullif(trim(requested_pitch), ''),

    'draft',

    requested_player_price,

    requested_max_players,

    current_admin_id,

    requested_matchday,

    nullif(trim(requested_phase), ''),

    nullif(trim(requested_zone), ''),

    requested_match_number

  )
  returning id
  into new_match_id;


  return new_match_id;

end;
$$;



-- ============================================================
-- 9. ADMIN - PUBLICAR PARTIDO
-- ============================================================

create or replace function public.publish_match_v1(
  requested_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare

  current_admin_id uuid := auth.uid();

  match_row public.matches%rowtype;

begin

  if current_admin_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  if not public.has_role(current_admin_id, 'admin') then
    raise exception 'ADMIN_REQUIRED';
  end if;


  select *
  into match_row
  from public.matches
  where id = requested_match_id
  for update;


  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;


  if match_row.status <> 'draft' then
    raise exception 'MATCH_NOT_DRAFT';
  end if;


  if match_row.scheduled_at is null then
    raise exception 'SCHEDULE_REQUIRED';
  end if;


  if match_row.player_price is null then
    raise exception 'PLAYER_PRICE_REQUIRED';
  end if;


  if match_row.match_type = 'friendly'
     and match_row.max_players is null then
    raise exception 'FRIENDLY_MAX_PLAYERS_REQUIRED';
  end if;


  if match_row.match_type = 'competition'
     and (
       match_row.competition_id is null
       or match_row.home_team_id is null
       or match_row.away_team_id is null
     ) then
    raise exception 'COMPETITION_DATA_INCOMPLETE';
  end if;


  update public.matches
  set
    status = 'open',
    updated_at = now()
  where id = requested_match_id;

end;
$$;



-- ============================================================
-- 10. ADMIN - ASIGNAR PLANILLERO
--
-- Agrega role planillero automaticamente.
-- El role se conserva cuando deja el partido.
-- ============================================================

create or replace function public.assign_match_scorekeeper(

  requested_match_id uuid,

  requested_user_id uuid

)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare

  current_admin_id uuid := auth.uid();

  current_status text;

begin

  if current_admin_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  if not public.has_role(current_admin_id, 'admin') then
    raise exception 'ADMIN_REQUIRED';
  end if;


  if not exists (
    select 1
    from public.profiles
    where id = requested_user_id
  ) then
    raise exception 'USER_NOT_FOUND';
  end if;


  select status
  into current_status
  from public.matches
  where id = requested_match_id;


  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;


  if current_status in (
    'completed',
    'cancelled'
  ) then
    raise exception 'MATCH_CLOSED';
  end if;


  insert into public.user_roles (
    user_id,
    role
  )
  values (
    requested_user_id,
    'planillero'
  )
  on conflict (user_id, role)
  do nothing;


  update public.matches
  set
    scorekeeper_user_id = requested_user_id,
    updated_at = now()
  where id = requested_match_id;

end;
$$;



-- ============================================================
-- 11. ADMIN - QUITAR PLANILLERO
-- ============================================================

create or replace function public.remove_match_scorekeeper(
  requested_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare

  current_admin_id uuid := auth.uid();

begin

  if current_admin_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  if not public.has_role(current_admin_id, 'admin') then
    raise exception 'ADMIN_REQUIRED';
  end if;


  update public.matches
  set
    scorekeeper_user_id = null,
    updated_at = now()
  where id = requested_match_id;


  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;

end;
$$;



-- ============================================================
-- 12. PLAYER - INSCRIBIRSE A AMISTOSO
-- ============================================================

create or replace function public.join_friendly_match(
  requested_match_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare

  current_user_id uuid := auth.uid();

  current_player_id uuid;

  match_row public.matches%rowtype;

  existing_match_player_id uuid;

  existing_status text;

  active_players integer;

  result_match_player_id uuid;

begin

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  select id
  into current_player_id
  from public.players
  where user_id = current_user_id
  limit 1;


  if current_player_id is null then
    raise exception 'PLAYER_PROFILE_REQUIRED';
  end if;


  select *
  into match_row
  from public.matches
  where id = requested_match_id
  for update;


  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;


  if match_row.match_type <> 'friendly' then
    raise exception 'MATCH_IS_NOT_FRIENDLY';
  end if;


  if match_row.status not in (
    'open',
    'full'
  ) then
    raise exception 'MATCH_NOT_OPEN';
  end if;


  if match_row.max_players is null then
    raise exception 'MATCH_HAS_NO_CAPACITY';
  end if;


  select
    id,
    participation_status
  into
    existing_match_player_id,
    existing_status
  from public.match_players
  where match_id = requested_match_id
    and player_id = current_player_id
  limit 1;


  if existing_match_player_id is not null then

    if existing_status in (
      'reserved',
      'confirmed'
    ) then
      return existing_match_player_id;
    end if;


    if existing_status in (
      'played',
      'no_show'
    ) then
      raise exception 'PLAYER_ALREADY_PARTICIPATED';
    end if;

  end if;


  select count(*)
  into active_players
  from public.match_players
  where match_id = requested_match_id
    and participation_status <> 'cancelled';


  if active_players >= match_row.max_players then
    raise exception 'MATCH_FULL';
  end if;


  if existing_match_player_id is not null
     and existing_status = 'cancelled' then

    update public.match_players
    set
      participation_status = 'reserved',
      attendance_status = 'pending',
      team_id = null,
      side = null,
      position = null,
      starter = false,
      minutes_played = null,
      updated_at = now()
    where id = existing_match_player_id;


    result_match_player_id :=
      existing_match_player_id;

  else

    insert into public.match_players (

      match_id,

      player_id,

      participation_status,

      attendance_status

    )
    values (

      requested_match_id,

      current_player_id,

      'reserved',

      'pending'

    )
    returning id
    into result_match_player_id;

  end if;


  insert into public.match_player_financials (

    match_player_id,

    amount_due

  )
  values (

    result_match_player_id,

    coalesce(match_row.player_price, 0)

  )
  on conflict (match_player_id)
  do update
  set
    amount_due = excluded.amount_due,
    updated_at = now();


  active_players := active_players + 1;


  update public.matches
  set
    status =
      case
        when active_players >= max_players
          then 'full'
        else 'open'
      end,
    updated_at = now()
  where id = requested_match_id;


  return result_match_player_id;

end;
$$;



-- ============================================================
-- 13. COACH - CONVOCAR JUGADOR A COMPETENCIA
-- ============================================================

create or replace function public.coach_invite_match_player(

  requested_match_id uuid,

  requested_player_id uuid

)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare

  current_user_id uuid := auth.uid();

  coach_team_id uuid;

  player_team_id uuid;

  player_side text;

  match_row public.matches%rowtype;

  existing_match_player_id uuid;

  existing_status text;

  result_match_player_id uuid;

begin

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  if not public.has_role(
    current_user_id,
    'coach'
  ) then
    raise exception 'COACH_REQUIRED';
  end if;


  select team_id
  into coach_team_id
  from public.team_coaches
  where user_id = current_user_id
    and left_at is null
  limit 1;


  if coach_team_id is null then
    raise exception 'COACH_HAS_NO_ACTIVE_TEAM';
  end if;


  select *
  into match_row
  from public.matches
  where id = requested_match_id
  for update;


  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;


  if match_row.match_type <> 'competition' then
    raise exception 'MATCH_IS_NOT_COMPETITION';
  end if;


  if match_row.status <> 'open' then
    raise exception 'MATCH_NOT_OPEN';
  end if;


  if coach_team_id = match_row.home_team_id then

    player_side := 'home';

  elsif coach_team_id = match_row.away_team_id then

    player_side := 'away';

  else

    raise exception 'COACH_TEAM_NOT_IN_MATCH';

  end if;


  select team_id
  into player_team_id
  from public.team_members
  where player_id = requested_player_id
    and left_at is null
  limit 1;


  if player_team_id is null
     or player_team_id <> coach_team_id then
    raise exception 'PLAYER_NOT_IN_COACH_TEAM';
  end if;


  select
    id,
    participation_status
  into
    existing_match_player_id,
    existing_status
  from public.match_players
  where match_id = requested_match_id
    and player_id = requested_player_id
  limit 1;


  if existing_match_player_id is not null then

    if existing_status in (
      'reserved',
      'confirmed'
    ) then
      return existing_match_player_id;
    end if;


    if existing_status in (
      'played',
      'no_show'
    ) then
      raise exception 'PLAYER_ALREADY_PARTICIPATED';
    end if;

  end if;


  if existing_match_player_id is not null
     and existing_status = 'cancelled' then

    update public.match_players
    set
      team_id = coach_team_id,
      side = player_side,
      participation_status = 'reserved',
      attendance_status = 'pending',
      updated_at = now()
    where id = existing_match_player_id;


    result_match_player_id :=
      existing_match_player_id;

  else

    insert into public.match_players (

      match_id,

      player_id,

      team_id,

      side,

      participation_status,

      attendance_status

    )
    values (

      requested_match_id,

      requested_player_id,

      coach_team_id,

      player_side,

      'reserved',

      'pending'

    )
    returning id
    into result_match_player_id;

  end if;


  insert into public.match_player_financials (

    match_player_id,

    amount_due

  )
  values (

    result_match_player_id,

    coalesce(match_row.player_price, 0)

  )
  on conflict (match_player_id)
  do update
  set
    amount_due = excluded.amount_due,
    updated_at = now();


  return result_match_player_id;

end;
$$;



-- ============================================================
-- 14. PLAYER - CONFIRMAR / CANCELAR
-- ============================================================

create or replace function public.respond_match_participation(

  requested_match_player_id uuid,

  requested_decision text

)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare

  current_user_id uuid := auth.uid();

  normalized_decision text :=
    lower(trim(requested_decision));

  mp_row public.match_players%rowtype;

  match_row public.matches%rowtype;

  active_players integer;

begin

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  if normalized_decision not in (
    'confirm',
    'cancel'
  ) then
    raise exception 'INVALID_DECISION';
  end if;


  select *
  into mp_row
  from public.match_players
  where id = requested_match_player_id
  for update;


  if not found then
    raise exception 'MATCH_PLAYER_NOT_FOUND';
  end if;


  if not exists (
    select 1
    from public.players
    where id = mp_row.player_id
      and user_id = current_user_id
  ) then
    raise exception 'NOT_YOUR_PARTICIPATION';
  end if;


  select *
  into match_row
  from public.matches
  where id = mp_row.match_id
  for update;


  if match_row.status not in (
    'open',
    'full',
    'confirmed'
  ) then
    raise exception 'MATCH_NOT_ACCEPTING_RESPONSES';
  end if;


  if normalized_decision = 'confirm' then

    if mp_row.participation_status = 'confirmed' then
      return;
    end if;


    if mp_row.participation_status <> 'reserved' then
      raise exception 'PARTICIPATION_CANNOT_BE_CONFIRMED';
    end if;


    update public.match_players
    set
      participation_status = 'confirmed',
      updated_at = now()
    where id = requested_match_player_id;


    return;

  end if;


  if normalized_decision = 'cancel' then

    if mp_row.participation_status = 'cancelled' then
      return;
    end if;


    if mp_row.participation_status not in (
      'reserved',
      'confirmed'
    ) then
      raise exception 'PARTICIPATION_CANNOT_BE_CANCELLED';
    end if;


    update public.match_players
    set
      participation_status = 'cancelled',
      attendance_status = 'pending',
      updated_at = now()
    where id = requested_match_player_id;


    if match_row.match_type = 'friendly'
       and match_row.max_players is not null then

      select count(*)
      into active_players
      from public.match_players
      where match_id = match_row.id
        and participation_status <> 'cancelled';


      if match_row.status = 'full'
         and active_players < match_row.max_players then

        update public.matches
        set
          status = 'open',
          updated_at = now()
        where id = match_row.id;

      end if;

    end if;

  end if;

end;
$$;



-- ============================================================
-- 15. PLANILLERO - ASISTENCIA
-- ============================================================

create or replace function public.set_match_attendance(

  requested_match_player_id uuid,

  requested_attendance_status text

)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare

  normalized_status text :=
    lower(trim(requested_attendance_status));

  mp_row public.match_players%rowtype;

  match_status text;

begin

  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  if normalized_status not in (
    'pending',
    'present',
    'absent'
  ) then
    raise exception 'INVALID_ATTENDANCE_STATUS';
  end if;


  select *
  into mp_row
  from public.match_players
  where id = requested_match_player_id
  for update;


  if not found then
    raise exception 'MATCH_PLAYER_NOT_FOUND';
  end if;


  if not public.can_operate_match(mp_row.match_id) then
    raise exception 'MATCH_OPERATOR_REQUIRED';
  end if;


  select status
  into match_status
  from public.matches
  where id = mp_row.match_id;


  if match_status in (
    'completed',
    'cancelled'
  ) then
    raise exception 'MATCH_CLOSED';
  end if;


  if normalized_status <> 'pending'
     and mp_row.participation_status <> 'confirmed' then
    raise exception 'PLAYER_NOT_CONFIRMED';
  end if;


  update public.match_players
  set
    attendance_status = normalized_status,
    updated_at = now()
  where id = requested_match_player_id;

end;
$$;



-- ============================================================
-- 16. PLANILLERO / ADMIN - REGISTRAR PAGO
-- ============================================================

create or replace function public.record_match_payment(

  requested_match_player_id uuid,

  requested_amount numeric,

  requested_method text,

  requested_note text default null

)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare

  current_user_id uuid := auth.uid();

  requested_match_id uuid;

  match_price numeric;

  financial_due numeric;

  already_credited numeric;

  new_payment_id uuid;

begin

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  if requested_amount is null
     or requested_amount <= 0 then
    raise exception 'INVALID_PAYMENT_AMOUNT';
  end if;


  if nullif(trim(requested_method), '') is null then
    raise exception 'PAYMENT_METHOD_REQUIRED';
  end if;


  select
    mp.match_id,
    m.player_price
  into
    requested_match_id,
    match_price
  from public.match_players mp
  join public.matches m
    on m.id = mp.match_id
  where mp.id = requested_match_player_id;


  if not found then
    raise exception 'MATCH_PLAYER_NOT_FOUND';
  end if;


  if not public.can_operate_match(
    requested_match_id
  ) then
    raise exception 'MATCH_OPERATOR_REQUIRED';
  end if;


  insert into public.match_player_financials (

    match_player_id,

    amount_due

  )
  values (

    requested_match_player_id,

    coalesce(match_price, 0)

  )
  on conflict (match_player_id)
  do nothing;


  select amount_due
  into financial_due
  from public.match_player_financials
  where match_player_id =
    requested_match_player_id
  for update;


  select coalesce(sum(amount), 0)
  into already_credited
  from public.match_payments
  where match_player_id =
    requested_match_player_id
    and voided_at is null;


  if already_credited + requested_amount >
     financial_due then
    raise exception 'PAYMENT_EXCEEDS_BALANCE';
  end if;


  insert into public.match_payments (

    match_player_id,

    kind,

    amount,

    method,

    note,

    registered_by

  )
  values (

    requested_match_player_id,

    'payment',

    requested_amount,

    lower(trim(requested_method)),

    nullif(trim(requested_note), ''),

    current_user_id

  )
  returning id
  into new_payment_id;


  return new_payment_id;

end;
$$;



-- ============================================================
-- 17. ADMIN - CORTESIA / WAIVER
-- ============================================================

create or replace function public.grant_match_waiver(

  requested_match_player_id uuid,

  requested_amount numeric,

  requested_note text default null

)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare

  current_admin_id uuid := auth.uid();

  match_price numeric;

  financial_due numeric;

  already_credited numeric;

  new_payment_id uuid;

begin

  if current_admin_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  if not public.has_role(
    current_admin_id,
    'admin'
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;


  if requested_amount is null
     or requested_amount <= 0 then
    raise exception 'INVALID_WAIVER_AMOUNT';
  end if;


  select m.player_price
  into match_price
  from public.match_players mp
  join public.matches m
    on m.id = mp.match_id
  where mp.id = requested_match_player_id;


  if not found then
    raise exception 'MATCH_PLAYER_NOT_FOUND';
  end if;


  insert into public.match_player_financials (

    match_player_id,

    amount_due

  )
  values (

    requested_match_player_id,

    coalesce(match_price, 0)

  )
  on conflict (match_player_id)
  do nothing;


  select amount_due
  into financial_due
  from public.match_player_financials
  where match_player_id =
    requested_match_player_id
  for update;


  select coalesce(sum(amount), 0)
  into already_credited
  from public.match_payments
  where match_player_id =
    requested_match_player_id
    and voided_at is null;


  if already_credited + requested_amount >
     financial_due then
    raise exception 'WAIVER_EXCEEDS_BALANCE';
  end if;


  insert into public.match_payments (

    match_player_id,

    kind,

    amount,

    method,

    note,

    registered_by

  )
  values (

    requested_match_player_id,

    'waiver',

    requested_amount,

    null,

    nullif(trim(requested_note), ''),

    current_admin_id

  )
  returning id
  into new_payment_id;


  return new_payment_id;

end;
$$;



-- ============================================================
-- 18. ADMIN - ANULAR MOVIMIENTO DE PAGO
--
-- No borramos movimientos financieros.
-- ============================================================

create or replace function public.void_match_payment(

  requested_payment_id uuid,

  requested_reason text

)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare

  current_admin_id uuid := auth.uid();

begin

  if current_admin_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  if not public.has_role(
    current_admin_id,
    'admin'
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;


  if nullif(trim(requested_reason), '') is null then
    raise exception 'VOID_REASON_REQUIRED';
  end if;


  update public.match_payments
  set
    voided_at = now(),
    voided_by = current_admin_id,
    void_reason = trim(requested_reason)
  where id = requested_payment_id
    and voided_at is null;


  if not found then
    raise exception 'ACTIVE_PAYMENT_NOT_FOUND';
  end if;

end;
$$;



-- ============================================================
-- 19. PLANILLERO / ADMIN - INICIAR PARTIDO
-- ============================================================

create or replace function public.start_match_v1(
  requested_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare

  current_status text;

begin

  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  if not public.can_operate_match(
    requested_match_id
  ) then
    raise exception 'MATCH_OPERATOR_REQUIRED';
  end if;


  select status
  into current_status
  from public.matches
  where id = requested_match_id
  for update;


  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;


  if current_status not in (
    'open',
    'full',
    'confirmed'
  ) then
    raise exception 'MATCH_CANNOT_START';
  end if;


  update public.matches
  set
    status = 'in_progress',
    updated_at = now()
  where id = requested_match_id;

end;
$$;



-- ============================================================
-- 20. PLANILLERO / ADMIN - FINALIZAR PARTIDO
-- ============================================================

create or replace function public.complete_match_v1(

  requested_match_id uuid,

  requested_home_score integer,

  requested_away_score integer

)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare

  current_status text;

  unresolved_attendance integer;

begin

  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  if not public.can_operate_match(
    requested_match_id
  ) then
    raise exception 'MATCH_OPERATOR_REQUIRED';
  end if;


  if requested_home_score is null
     or requested_home_score < 0
     or requested_away_score is null
     or requested_away_score < 0 then
    raise exception 'INVALID_SCORE';
  end if;


  select status
  into current_status
  from public.matches
  where id = requested_match_id
  for update;


  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;


  if current_status <> 'in_progress' then
    raise exception 'MATCH_NOT_IN_PROGRESS';
  end if;


  select count(*)
  into unresolved_attendance
  from public.match_players
  where match_id = requested_match_id
    and participation_status = 'confirmed'
    and attendance_status = 'pending';


  if unresolved_attendance > 0 then
    raise exception 'ATTENDANCE_PENDING';
  end if;


  update public.match_players
  set
    participation_status =
      case

        when participation_status = 'confirmed'
         and attendance_status = 'present'
          then 'played'

        when participation_status = 'confirmed'
         and attendance_status = 'absent'
          then 'no_show'

        else participation_status

      end,

    updated_at = now()

  where match_id = requested_match_id;


  update public.matches
  set
    home_score = requested_home_score,
    away_score = requested_away_score,
    status = 'completed',
    updated_at = now()
  where id = requested_match_id;

end;
$$;



-- ============================================================
-- 21. PERMISOS RPC
-- ============================================================

revoke all
on function public.create_match_v1(
  text,
  timestamptz,
  numeric,
  text,
  text,
  integer,
  uuid,
  uuid,
  uuid,
  integer,
  text,
  text,
  integer
)
from public;

grant execute
on function public.create_match_v1(
  text,
  timestamptz,
  numeric,
  text,
  text,
  integer,
  uuid,
  uuid,
  uuid,
  integer,
  text,
  text,
  integer
)
to authenticated;


revoke all
on function public.publish_match_v1(uuid)
from public;

grant execute
on function public.publish_match_v1(uuid)
to authenticated;


revoke all
on function public.assign_match_scorekeeper(uuid, uuid)
from public;

grant execute
on function public.assign_match_scorekeeper(uuid, uuid)
to authenticated;


revoke all
on function public.remove_match_scorekeeper(uuid)
from public;

grant execute
on function public.remove_match_scorekeeper(uuid)
to authenticated;


revoke all
on function public.join_friendly_match(uuid)
from public;

grant execute
on function public.join_friendly_match(uuid)
to authenticated;


revoke all
on function public.coach_invite_match_player(uuid, uuid)
from public;

grant execute
on function public.coach_invite_match_player(uuid, uuid)
to authenticated;


revoke all
on function public.respond_match_participation(uuid, text)
from public;

grant execute
on function public.respond_match_participation(uuid, text)
to authenticated;


revoke all
on function public.set_match_attendance(uuid, text)
from public;

grant execute
on function public.set_match_attendance(uuid, text)
to authenticated;


revoke all
on function public.record_match_payment(uuid, numeric, text, text)
from public;

grant execute
on function public.record_match_payment(uuid, numeric, text, text)
to authenticated;


revoke all
on function public.grant_match_waiver(uuid, numeric, text)
from public;

grant execute
on function public.grant_match_waiver(uuid, numeric, text)
to authenticated;


revoke all
on function public.void_match_payment(uuid, text)
from public;

grant execute
on function public.void_match_payment(uuid, text)
to authenticated;


revoke all
on function public.start_match_v1(uuid)
from public;

grant execute
on function public.start_match_v1(uuid)
to authenticated;


revoke all
on function public.complete_match_v1(uuid, integer, integer)
from public;

grant execute
on function public.complete_match_v1(uuid, integer, integer)
to authenticated;


commit;