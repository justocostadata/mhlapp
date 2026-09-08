sql = r"""begin;

-- ============================================================
-- MHLAPP
-- Teams + Coaches + Roster Requests
-- 2026-09-07
--
-- REGLAS:
-- - Un equipo puede tener varios coaches.
-- - Un coach puede dirigir maximo un equipo activo.
-- - Player y Coach son relaciones independientes.
-- - Si una persona es Player + Coach, ambas relaciones
--   deben corresponder al mismo equipo.
-- - Un player solo puede tener un team activo.
--   (YA protegido por uq_team_members_active_player)
-- - Coach solicita ADD / REMOVE.
-- - Admin aprueba o rechaza.
-- - Jugador en otro equipo requiere futuro TRANSFER.
-- ============================================================


-- ============================================================
-- 1. INTEGRIDAD COACH -> UN SOLO EQUIPO ACTIVO
-- ============================================================

create unique index if not exists uq_team_coaches_active_user
on public.team_coaches(user_id)
where left_at is null;


-- ============================================================
-- 2. COACH PUEDE LEER SU PROPIA ASIGNACION
-- ============================================================

drop policy if exists
  "Coaches read own team assignments"
on public.team_coaches;

create policy
  "Coaches read own team assignments"
on public.team_coaches
for select
to authenticated
using (
  user_id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
);

grant select
on public.team_coaches
to authenticated;


-- ============================================================
-- 3. SOLICITUDES DE CAMBIO DE PLANTILLA
-- ============================================================

create table if not exists public.team_roster_requests (
  id uuid primary key default gen_random_uuid(),

  team_id uuid not null
    references public.teams(id),

  coach_user_id uuid not null
    references auth.users(id),

  player_id uuid not null
    references public.players(id),

  request_type text not null
    check (request_type in ('add', 'remove')),

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'approved',
        'rejected',
        'cancelled'
      )
    ),

  reason text,

  requested_at timestamptz not null default now(),

  reviewed_at timestamptz,

  reviewed_by uuid
    references auth.users(id)
    on delete set null,

  cancelled_at timestamptz,

  admin_notes text,

  applied_team_member_id uuid
    references public.team_members(id)
    on delete set null
);


create index if not exists idx_team_roster_requests_team
on public.team_roster_requests(team_id);

create index if not exists idx_team_roster_requests_coach
on public.team_roster_requests(coach_user_id);

create index if not exists idx_team_roster_requests_player
on public.team_roster_requests(player_id);

create index if not exists idx_team_roster_requests_status
on public.team_roster_requests(status);

create index if not exists idx_team_roster_requests_requested_at
on public.team_roster_requests(requested_at desc);


-- Evita dos solicitudes pendientes contradictorias
-- para el mismo jugador y equipo.
create unique index if not exists uq_team_roster_requests_pending
on public.team_roster_requests(team_id, player_id)
where status = 'pending';


-- ============================================================
-- 4. RLS
-- ============================================================

alter table public.team_roster_requests
enable row level security;


drop policy if exists
  "Admins read roster requests"
on public.team_roster_requests;

create policy
  "Admins read roster requests"
on public.team_roster_requests
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
);


drop policy if exists
  "Coaches read team roster requests"
on public.team_roster_requests;

create policy
  "Coaches read team roster requests"
on public.team_roster_requests
for select
to authenticated
using (
  coach_user_id = auth.uid()
  or exists (
    select 1
    from public.team_coaches tc
    where tc.team_id = team_roster_requests.team_id
      and tc.user_id = auth.uid()
      and tc.left_at is null
  )
);


-- Escrituras directas bloqueadas.
-- Todo pasa por RPC.
revoke insert, update, delete
on public.team_roster_requests
from anon, authenticated;

grant select
on public.team_roster_requests
to authenticated;


-- ============================================================
-- 5. ADMIN: ASIGNAR COACH
--
-- Si el usuario no tiene role coach, se agrega.
-- Si tambien es player con equipo activo, solo puede dirigir
-- ese mismo equipo.
-- ============================================================

create or replace function public.assign_team_coach(
  requested_user_id uuid,
  requested_team_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_admin_id uuid := auth.uid();

  existing_assignment_id uuid;
  existing_coach_team_id uuid;

  player_team_id uuid;

  new_assignment_id uuid;
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


  if not exists (
    select 1
    from public.teams
    where id = requested_team_id
  ) then
    raise exception 'TEAM_NOT_FOUND';
  end if;


  -- ----------------------------------------------------------
  -- Ya dirige un equipo?
  -- ----------------------------------------------------------

  select
    tc.id,
    tc.team_id
  into
    existing_assignment_id,
    existing_coach_team_id
  from public.team_coaches tc
  where tc.user_id = requested_user_id
    and tc.left_at is null
  limit 1;


  if existing_assignment_id is not null then

    if existing_coach_team_id = requested_team_id then
      return existing_assignment_id;
    end if;

    raise exception 'COACH_ALREADY_ASSIGNED_TO_ANOTHER_TEAM';

  end if;


  -- ----------------------------------------------------------
  -- Si tambien es player con team activo,
  -- debe ser EL MISMO EQUIPO.
  -- ----------------------------------------------------------

  select tm.team_id
  into player_team_id
  from public.players p
  join public.team_members tm
    on tm.player_id = p.id
   and tm.left_at is null
  where p.user_id = requested_user_id
  limit 1;


  if player_team_id is not null
     and player_team_id <> requested_team_id then

    raise exception 'COACH_PLAYER_TEAM_MISMATCH';

  end if;


  -- ----------------------------------------------------------
  -- Agregamos role coach automaticamente.
  -- El rol NO se elimina al dejar de dirigir.
  -- ----------------------------------------------------------

  insert into public.user_roles (
    user_id,
    role
  )
  values (
    requested_user_id,
    'coach'
  )
  on conflict (user_id, role)
  do nothing;


  insert into public.team_coaches (
    team_id,
    user_id,
    joined_at
  )
  values (
    requested_team_id,
    requested_user_id,
    now()
  )
  returning id
  into new_assignment_id;


  return new_assignment_id;

end;
$$;


revoke all
on function public.assign_team_coach(uuid, uuid)
from public;

grant execute
on function public.assign_team_coach(uuid, uuid)
to authenticated;


-- ============================================================
-- 6. ADMIN: QUITAR COACH DEL EQUIPO
--
-- Cierra historial con left_at.
-- NO elimina role coach.
-- ============================================================

create or replace function public.remove_team_coach(
  requested_team_coach_id uuid
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


  update public.team_coaches
  set left_at = now()
  where id = requested_team_coach_id
    and left_at is null;


  if not found then
    raise exception 'ACTIVE_COACH_ASSIGNMENT_NOT_FOUND';
  end if;

end;
$$;


revoke all
on function public.remove_team_coach(uuid)
from public;

grant execute
on function public.remove_team_coach(uuid)
to authenticated;


-- ============================================================
-- 7. COACH: SOLICITAR ADD / REMOVE
--
-- El team_id NO viene del navegador.
-- Se deriva del unico equipo activo del coach.
-- ============================================================

create or replace function public.request_team_roster_change(
  requested_player_id uuid,
  requested_request_type text,
  requested_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();

  coach_team_id uuid;

  normalized_type text :=
    lower(trim(requested_request_type));

  current_player_team_id uuid;

  player_coach_team_id uuid;

  new_request_id uuid;
begin

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  if not public.has_role(current_user_id, 'coach') then
    raise exception 'COACH_REQUIRED';
  end if;


  if normalized_type not in ('add', 'remove') then
    raise exception 'INVALID_REQUEST_TYPE';
  end if;


  select tc.team_id
  into coach_team_id
  from public.team_coaches tc
  where tc.user_id = current_user_id
    and tc.left_at is null
  limit 1;


  if coach_team_id is null then
    raise exception 'COACH_HAS_NO_ACTIVE_TEAM';
  end if;


  if not exists (
    select 1
    from public.players
    where id = requested_player_id
  ) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;


  -- Equipo actual del player.
  select tm.team_id
  into current_player_team_id
  from public.team_members tm
  where tm.player_id = requested_player_id
    and tm.left_at is null
  limit 1;


  -- ----------------------------------------------------------
  -- ADD
  -- ----------------------------------------------------------

  if normalized_type = 'add' then

    if current_player_team_id = coach_team_id then
      raise exception 'PLAYER_ALREADY_IN_TEAM';
    end if;


    if current_player_team_id is not null
       and current_player_team_id <> coach_team_id then

      raise exception 'PLAYER_REQUIRES_TRANSFER';

    end if;


    -- Si el jugador tambien es coach,
    -- solo puede jugar en el mismo equipo que dirige.
    select tc.team_id
    into player_coach_team_id
    from public.players p
    join public.team_coaches tc
      on tc.user_id = p.user_id
     and tc.left_at is null
    where p.id = requested_player_id
    limit 1;


    if player_coach_team_id is not null
       and player_coach_team_id <> coach_team_id then

      raise exception 'PLAYER_COACH_TEAM_MISMATCH';

    end if;

  end if;


  -- ----------------------------------------------------------
  -- REMOVE
  -- ----------------------------------------------------------

  if normalized_type = 'remove' then

    if current_player_team_id is null then
      raise exception 'PLAYER_HAS_NO_ACTIVE_TEAM';
    end if;


    if current_player_team_id <> coach_team_id then
      raise exception 'PLAYER_NOT_IN_COACH_TEAM';
    end if;

  end if;


  if exists (
    select 1
    from public.team_roster_requests trr
    where trr.team_id = coach_team_id
      and trr.player_id = requested_player_id
      and trr.status = 'pending'
  ) then
    raise exception 'PENDING_ROSTER_REQUEST_EXISTS';
  end if;


  insert into public.team_roster_requests (
    team_id,
    coach_user_id,
    player_id,
    request_type,
    reason
  )
  values (
    coach_team_id,
    current_user_id,
    requested_player_id,
    normalized_type,
    nullif(trim(requested_reason), '')
  )
  returning id
  into new_request_id;


  return new_request_id;

end;
$$;


revoke all
on function public.request_team_roster_change(uuid, text, text)
from public;

grant execute
on function public.request_team_roster_change(uuid, text, text)
to authenticated;


-- ============================================================
-- 8. COACH: CANCELAR SU SOLICITUD
-- ============================================================

create or replace function public.cancel_team_roster_request(
  requested_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  update public.team_roster_requests
  set
    status = 'cancelled',
    cancelled_at = now()
  where id = requested_request_id
    and coach_user_id = current_user_id
    and status = 'pending';


  if not found then
    raise exception 'PENDING_REQUEST_NOT_FOUND';
  end if;

end;
$$;


revoke all
on function public.cancel_team_roster_request(uuid)
from public;

grant execute
on function public.cancel_team_roster_request(uuid)
to authenticated;


-- ============================================================
-- 9. ADMIN: APROBAR / RECHAZAR SOLICITUD
-- ============================================================

create or replace function public.review_team_roster_request(
  requested_request_id uuid,
  decision text,
  notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_admin_id uuid := auth.uid();

  roster_request
    public.team_roster_requests%rowtype;

  normalized_decision text :=
    lower(trim(decision));

  active_membership_id uuid;
  active_membership_team_id uuid;

  player_coach_team_id uuid;

  new_membership_id uuid;
begin

  if current_admin_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;


  if not public.has_role(current_admin_id, 'admin') then
    raise exception 'ADMIN_REQUIRED';
  end if;


  if normalized_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_DECISION';
  end if;


  select *
  into roster_request
  from public.team_roster_requests
  where id = requested_request_id
  for update;


  if not found then
    raise exception 'ROSTER_REQUEST_NOT_FOUND';
  end if;


  if roster_request.status <> 'pending' then
    raise exception 'ROSTER_REQUEST_ALREADY_REVIEWED';
  end if;


  -- ----------------------------------------------------------
  -- REJECT
  -- ----------------------------------------------------------

  if normalized_decision = 'rejected' then

    update public.team_roster_requests
    set
      status = 'rejected',
      reviewed_at = now(),
      reviewed_by = current_admin_id,
      admin_notes = notes
    where id = requested_request_id;

    return;

  end if;


  -- ----------------------------------------------------------
  -- Buscar membresia activa actual.
  -- ----------------------------------------------------------

  select
    tm.id,
    tm.team_id
  into
    active_membership_id,
    active_membership_team_id
  from public.team_members tm
  where tm.player_id = roster_request.player_id
    and tm.left_at is null
  limit 1
  for update;


  -- ----------------------------------------------------------
  -- APPROVE ADD
  -- ----------------------------------------------------------

  if roster_request.request_type = 'add' then

    if active_membership_id is not null then

      if active_membership_team_id = roster_request.team_id then
        raise exception 'PLAYER_ALREADY_IN_TEAM';
      end if;

      raise exception 'PLAYER_REQUIRES_TRANSFER';

    end if;


    -- Si el jugador tambien dirige un equipo,
    -- solo puede incorporarse al mismo.
    select tc.team_id
    into player_coach_team_id
    from public.players p
    join public.team_coaches tc
      on tc.user_id = p.user_id
     and tc.left_at is null
    where p.id = roster_request.player_id
    limit 1;


    if player_coach_team_id is not null
       and player_coach_team_id <> roster_request.team_id then

      raise exception 'PLAYER_COACH_TEAM_MISMATCH';

    end if;


    insert into public.team_members (
      team_id,
      player_id,
      joined_at
    )
    values (
      roster_request.team_id,
      roster_request.player_id,
      now()
    )
    returning id
    into new_membership_id;


    -- Membership es la fuente real.
    -- Solo sincronizamos status de manera conservadora.
    update public.players
    set status =
      case
        when status = 'suspended' then status
        else 'rostered'
      end
    where id = roster_request.player_id;


    update public.team_roster_requests
    set
      status = 'approved',
      reviewed_at = now(),
      reviewed_by = current_admin_id,
      admin_notes = notes,
      applied_team_member_id = new_membership_id
    where id = requested_request_id;


    return;

  end if;


  -- ----------------------------------------------------------
  -- APPROVE REMOVE
  -- ----------------------------------------------------------

  if roster_request.request_type = 'remove' then

    if active_membership_id is null then
      raise exception 'PLAYER_HAS_NO_ACTIVE_TEAM';
    end if;


    if active_membership_team_id <> roster_request.team_id then
      raise exception 'PLAYER_NOT_IN_REQUEST_TEAM';
    end if;


    update public.team_members
    set left_at = now()
    where id = active_membership_id;


    update public.players
    set status =
      case
        when status = 'suspended' then status
        else 'free'
      end
    where id = roster_request.player_id;


    update public.team_roster_requests
    set
      status = 'approved',
      reviewed_at = now(),
      reviewed_by = current_admin_id,
      admin_notes = notes,
      applied_team_member_id = active_membership_id
    where id = requested_request_id;


    return;

  end if;

end;
$$;


revoke all
on function public.review_team_roster_request(uuid, text, text)
from public;

grant execute
on function public.review_team_roster_request(uuid, text, text)
to authenticated;


commit;
"""

path = "/mnt/data/20260907190500_teams_coach_roster_requests.sql"
with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(sql)

print(f"Archivo creado: {path}")
print(f"Tamaño: {len(sql.encode('utf-8'))} bytes")
