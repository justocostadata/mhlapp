begin;

-- ============================================================
-- MHLAPP - COMPETITION ENGINE V1
-- 2026-09-08
--
-- REGLAS
-- - Friendly: deuda individual por jugador.
-- - Competition: deuda por equipo.
-- - Ambos equipos pagan el mismo team_price del partido.
-- - Coach ve deuda/saldo de su equipo.
-- - Admin / planillero asignado registran pagos manuales.
-- - Coach no puede auto-marcar un pago manual como validado.
-- - Convocar jugadores NO genera deuda individual.
-- ============================================================


-- ============================================================
-- 1. MATCHES - PRECIO POR EQUIPO
-- ============================================================

alter table public.matches
  add column if not exists team_price numeric(12,2);


do $$
begin

  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_team_price_check'
      and conrelid = 'public.matches'::regclass
  ) then

    alter table public.matches
      add constraint matches_team_price_check
      check (
        team_price is null
        or team_price >= 0
      );

  end if;

end;
$$;



-- ============================================================
-- 2. FINANZAS POR EQUIPO / PARTIDO
-- ============================================================

create table if not exists public.match_team_financials (

  id uuid primary key default gen_random_uuid(),

  match_id uuid not null
    references public.matches(id)
    on delete cascade,

  team_id uuid not null
    references public.teams(id)
    on delete cascade,

  amount_due numeric(12,2) not null
    check (amount_due >= 0),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  unique (match_id, team_id)
);


create index if not exists idx_match_team_financials_match
on public.match_team_financials(match_id);

create index if not exists idx_match_team_financials_team
on public.match_team_financials(team_id);


alter table public.match_team_financials
enable row level security;



-- ============================================================
-- 3. PAGOS POR EQUIPO
-- ============================================================

create table if not exists public.match_team_payments (

  id uuid primary key default gen_random_uuid(),

  financial_id uuid not null
    references public.match_team_financials(id)
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

  paid_by_user_id uuid
    references auth.users(id)
    on delete set null,

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


create index if not exists idx_match_team_payments_financial
on public.match_team_payments(financial_id);

create index if not exists idx_match_team_payments_paid_at
on public.match_team_payments(paid_at desc);


alter table public.match_team_payments
enable row level security;



-- ============================================================
-- 4. RLS - TEAM FINANCIALS
-- ============================================================

drop policy if exists
  "Admins read match team financials"
on public.match_team_financials;

create policy
  "Admins read match team financials"
on public.match_team_financials
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
);


drop policy if exists
  "Coaches read own team financials"
on public.match_team_financials;

create policy
  "Coaches read own team financials"
on public.match_team_financials
for select
to authenticated
using (
  exists (
    select 1
    from public.team_coaches tc
    where tc.team_id = match_team_financials.team_id
      and tc.user_id = auth.uid()
      and tc.left_at is null
  )
);


drop policy if exists
  "Assigned scorekeeper reads match team financials"
on public.match_team_financials;

create policy
  "Assigned scorekeeper reads match team financials"
on public.match_team_financials
for select
to authenticated
using (
  exists (
    select 1
    from public.matches m
    where m.id = match_team_financials.match_id
      and m.scorekeeper_user_id = auth.uid()
  )
);



-- ============================================================
-- 5. RLS - TEAM PAYMENTS
-- ============================================================

drop policy if exists
  "Admins read match team payments"
on public.match_team_payments;

create policy
  "Admins read match team payments"
on public.match_team_payments
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
);


drop policy if exists
  "Coaches read own team payments"
on public.match_team_payments;

create policy
  "Coaches read own team payments"
on public.match_team_payments
for select
to authenticated
using (
  exists (
    select 1
    from public.match_team_financials mtf
    join public.team_coaches tc
      on tc.team_id = mtf.team_id
     and tc.user_id = auth.uid()
     and tc.left_at is null
    where mtf.id = match_team_payments.financial_id
  )
);


drop policy if exists
  "Assigned scorekeeper reads match team payments"
on public.match_team_payments;

create policy
  "Assigned scorekeeper reads match team payments"
on public.match_team_payments
for select
to authenticated
using (
  exists (
    select 1
    from public.match_team_financials mtf
    join public.matches m
      on m.id = mtf.match_id
    where mtf.id = match_team_payments.financial_id
      and m.scorekeeper_user_id = auth.uid()
  )
);


revoke all
on public.match_team_financials
from anon, authenticated;

revoke all
on public.match_team_payments
from anon, authenticated;

grant select
on public.match_team_financials
to authenticated;

grant select
on public.match_team_payments
to authenticated;



-- ============================================================
-- 6. ADMIN - CREAR PARTIDO COMPETITIVO
-- ============================================================

create or replace function public.create_competition_match_v1(

  requested_competition_id uuid,

  requested_home_team_id uuid,

  requested_away_team_id uuid,

  requested_scheduled_at timestamptz,

  requested_team_price numeric,

  requested_venue_name text default null,

  requested_pitch text default null,

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

  new_match_id uuid;

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


  if not exists (
    select 1
    from public.competitions
    where id = requested_competition_id
  ) then
    raise exception 'COMPETITION_NOT_FOUND';
  end if;


  if requested_home_team_id is null
     or requested_away_team_id is null then
    raise exception 'COMPETITION_TEAMS_REQUIRED';
  end if;


  if requested_home_team_id =
     requested_away_team_id then
    raise exception 'MATCH_TEAMS_MUST_BE_DIFFERENT';
  end if;


  if not exists (
    select 1
    from public.competition_teams
    where competition_id =
      requested_competition_id
      and team_id =
      requested_home_team_id
  ) then
    raise exception 'HOME_TEAM_NOT_IN_COMPETITION';
  end if;


  if not exists (
    select 1
    from public.competition_teams
    where competition_id =
      requested_competition_id
      and team_id =
      requested_away_team_id
  ) then
    raise exception 'AWAY_TEAM_NOT_IN_COMPETITION';
  end if;


  if requested_scheduled_at is null then
    raise exception 'SCHEDULE_REQUIRED';
  end if;


  if requested_team_price is null
     or requested_team_price < 0 then
    raise exception 'INVALID_TEAM_PRICE';
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

    team_price,

    created_by,

    matchday,

    phase,

    zone,

    match_number

  )
  values (

    'competition',

    requested_competition_id,

    requested_home_team_id,

    requested_away_team_id,

    requested_scheduled_at,

    nullif(trim(requested_venue_name), ''),

    nullif(trim(requested_pitch), ''),

    'draft',

    null,

    requested_team_price,

    current_admin_id,

    requested_matchday,

    nullif(trim(requested_phase), ''),

    nullif(trim(requested_zone), ''),

    requested_match_number

  )
  returning id
  into new_match_id;


  -- Congelamos la deuda de ambos equipos al crear el partido.

  insert into public.match_team_financials (
    match_id,
    team_id,
    amount_due
  )
  values
    (
      new_match_id,
      requested_home_team_id,
      requested_team_price
    ),
    (
      new_match_id,
      requested_away_team_id,
      requested_team_price
    );


  return new_match_id;

end;
$$;



-- ============================================================
-- 7. ACTUALIZAR PUBLICACION
--
-- Friendly:
--   player_price + max_players
--
-- Competition:
--   team_price + competencia + equipos
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


  if not public.has_role(
    current_admin_id,
    'admin'
  ) then
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


  if match_row.match_type = 'friendly' then

    if match_row.player_price is null then
      raise exception 'PLAYER_PRICE_REQUIRED';
    end if;


    if match_row.max_players is null then
      raise exception 'FRIENDLY_MAX_PLAYERS_REQUIRED';
    end if;

  elsif match_row.match_type = 'competition' then

    if match_row.team_price is null then
      raise exception 'TEAM_PRICE_REQUIRED';
    end if;


    if match_row.competition_id is null
       or match_row.home_team_id is null
       or match_row.away_team_id is null then
      raise exception 'COMPETITION_DATA_INCOMPLETE';
    end if;

  else

    raise exception 'INVALID_MATCH_TYPE';

  end if;


  update public.matches
  set
    status = 'open',
    updated_at = now()
  where id = requested_match_id;

end;
$$;



-- ============================================================
-- 8. CORREGIR CONVOCATORIA DEL COACH
--
-- IMPORTANTE:
-- Competencia NO genera deuda individual.
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


  -- DELIBERADAMENTE:
  -- no insertamos match_player_financials.
  -- La deuda pertenece al equipo.


  return result_match_player_id;

end;
$$;



-- ============================================================
-- 9. ADMIN / PLANILLERO - REGISTRAR PAGO DEL EQUIPO
-- ============================================================

create or replace function public.record_match_team_payment(

  requested_financial_id uuid,

  requested_amount numeric,

  requested_method text,

  requested_paid_by_user_id uuid default null,

  requested_note text default null

)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare

  current_user_id uuid := auth.uid();

  financial_row public.match_team_financials%rowtype;

  already_credited numeric;

  new_payment_id uuid;

begin

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  select *
  into financial_row
  from public.match_team_financials
  where id = requested_financial_id
  for update;


  if not found then
    raise exception 'TEAM_FINANCIAL_NOT_FOUND';
  end if;


  if not public.can_operate_match(
    financial_row.match_id
  ) then
    raise exception 'MATCH_OPERATOR_REQUIRED';
  end if;


  if requested_amount is null
     or requested_amount <= 0 then
    raise exception 'INVALID_PAYMENT_AMOUNT';
  end if;


  if nullif(trim(requested_method), '') is null then
    raise exception 'PAYMENT_METHOD_REQUIRED';
  end if;


  select coalesce(sum(amount), 0)
  into already_credited
  from public.match_team_payments
  where financial_id = requested_financial_id
    and voided_at is null;


  if already_credited + requested_amount >
     financial_row.amount_due then
    raise exception 'PAYMENT_EXCEEDS_BALANCE';
  end if;


  insert into public.match_team_payments (

    financial_id,

    kind,

    amount,

    method,

    note,

    paid_by_user_id,

    registered_by

  )
  values (

    requested_financial_id,

    'payment',

    requested_amount,

    lower(trim(requested_method)),

    nullif(trim(requested_note), ''),

    requested_paid_by_user_id,

    current_user_id

  )
  returning id
  into new_payment_id;


  return new_payment_id;

end;
$$;



-- ============================================================
-- 10. ADMIN - CORTESIA DEL EQUIPO
-- ============================================================

create or replace function public.grant_match_team_waiver(

  requested_financial_id uuid,

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

  financial_row public.match_team_financials%rowtype;

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


  select *
  into financial_row
  from public.match_team_financials
  where id = requested_financial_id
  for update;


  if not found then
    raise exception 'TEAM_FINANCIAL_NOT_FOUND';
  end if;


  select coalesce(sum(amount), 0)
  into already_credited
  from public.match_team_payments
  where financial_id = requested_financial_id
    and voided_at is null;


  if already_credited + requested_amount >
     financial_row.amount_due then
    raise exception 'WAIVER_EXCEEDS_BALANCE';
  end if;


  insert into public.match_team_payments (

    financial_id,

    kind,

    amount,

    method,

    note,

    registered_by

  )
  values (

    requested_financial_id,

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
-- 11. ADMIN - ANULAR PAGO/CORTESIA DEL EQUIPO
-- ============================================================

create or replace function public.void_match_team_payment(

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


  update public.match_team_payments
  set
    voided_at = now(),
    voided_by = current_admin_id,
    void_reason = trim(requested_reason)
  where id = requested_payment_id
    and voided_at is null;


  if not found then
    raise exception 'ACTIVE_TEAM_PAYMENT_NOT_FOUND';
  end if;

end;
$$;



-- ============================================================
-- 12. PERMISOS RPC
-- ============================================================

revoke all
on function public.create_competition_match_v1(
  uuid,
  uuid,
  uuid,
  timestamptz,
  numeric,
  text,
  text,
  integer,
  text,
  text,
  integer
)
from public;

grant execute
on function public.create_competition_match_v1(
  uuid,
  uuid,
  uuid,
  timestamptz,
  numeric,
  text,
  text,
  integer,
  text,
  text,
  integer
)
to authenticated;


revoke all
on function public.record_match_team_payment(
  uuid,
  numeric,
  text,
  uuid,
  text
)
from public;

grant execute
on function public.record_match_team_payment(
  uuid,
  numeric,
  text,
  uuid,
  text
)
to authenticated;


revoke all
on function public.grant_match_team_waiver(
  uuid,
  numeric,
  text
)
from public;

grant execute
on function public.grant_match_team_waiver(
  uuid,
  numeric,
  text
)
to authenticated;


revoke all
on function public.void_match_team_payment(
  uuid,
  text
)
from public;

grant execute
on function public.void_match_team_payment(
  uuid,
  text
)
to authenticated;


-- publish_match_v1 y coach_invite_match_player
-- conservan sus firmas/permisos anteriores.


commit;