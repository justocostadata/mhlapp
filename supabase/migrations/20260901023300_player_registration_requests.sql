begin;

-- ============================================================
-- MHLAPP
-- Player registration requests
--
-- Permite que un usuario que NO existe entre los jugadores
-- históricos solicite la creación de un nuevo perfil deportivo.
-- ============================================================

create table if not exists public.player_registration_requests (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  display_name text not null,
  position text not null,
  category text,

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'approved',
        'rejected',
        'cancelled'
      )
    ),

  requested_at timestamptz not null default now(),

  reviewed_at timestamptz,
  reviewed_by uuid
    references auth.users(id)
    on delete set null,

  cancelled_at timestamptz,

  admin_notes text,

  created_player_id uuid
    references public.players(id)
    on delete set null,

  constraint player_registration_display_name_not_blank
    check (length(trim(display_name)) >= 2),

  constraint player_registration_position_not_blank
    check (length(trim(position)) >= 1)
);


-- ============================================================
-- INDEXES / INTEGRITY
-- ============================================================

create index if not exists
  idx_player_registration_requests_user
on public.player_registration_requests(user_id);

create index if not exists
  idx_player_registration_requests_status
on public.player_registration_requests(status);

create index if not exists
  idx_player_registration_requests_requested_at
on public.player_registration_requests(requested_at desc);


-- Un usuario no puede tener dos solicitudes nuevas pendientes.
create unique index if not exists
  uq_player_registration_requests_pending_user
on public.player_registration_requests(user_id)
where status = 'pending';


-- ============================================================
-- RLS
-- ============================================================

alter table public.player_registration_requests
enable row level security;


drop policy if exists
  "Users can read own registration requests"
on public.player_registration_requests;

create policy
  "Users can read own registration requests"
on public.player_registration_requests
for select
to authenticated
using (
  user_id = auth.uid()
);


drop policy if exists
  "Admins can read registration requests"
on public.player_registration_requests;

create policy
  "Admins can read registration requests"
on public.player_registration_requests
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
);


-- Las escrituras NO se realizan directamente.
-- Solamente a través de RPC SECURITY DEFINER.

revoke insert, update, delete
on public.player_registration_requests
from authenticated;

grant select
on public.player_registration_requests
to authenticated;


-- ============================================================
-- RPC 1
-- USER: solicitar creación de jugador
-- ============================================================

create or replace function public.request_new_player_registration(
  requested_display_name text,
  requested_position text,
  requested_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  new_request_id uuid;
  clean_name text := trim(requested_display_name);
  clean_position text := trim(requested_position);
  clean_category text := nullif(trim(requested_category), '');
begin

  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;


  if clean_name is null or length(clean_name) < 2 then
    raise exception 'Nombre de jugador invalido';
  end if;


  if clean_position is null or length(clean_position) < 1 then
    raise exception 'Posicion requerida';
  end if;


  -- Ya existe un player vinculado a esta cuenta.
  if exists (
    select 1
    from public.players
    where user_id = current_user_id
  ) then
    raise exception 'El usuario ya tiene un perfil deportivo vinculado';
  end if;


  -- Ya está intentando reclamar un jugador histórico.
  if exists (
    select 1
    from public.player_claims
    where user_id = current_user_id
      and status = 'pending'
  ) then
    raise exception 'Ya existe una solicitud pendiente para vincular un jugador historico';
  end if;


  -- Ya pidió alta como jugador nuevo.
  if exists (
    select 1
    from public.player_registration_requests
    where user_id = current_user_id
      and status = 'pending'
  ) then
    raise exception 'Ya existe una solicitud de alta pendiente';
  end if;


  insert into public.player_registration_requests (
    user_id,
    display_name,
    position,
    category
  )
  values (
    current_user_id,
    clean_name,
    clean_position,
    clean_category
  )
  returning id
  into new_request_id;


  return new_request_id;

end;
$$;


revoke all
on function public.request_new_player_registration(text, text, text)
from public;

grant execute
on function public.request_new_player_registration(text, text, text)
to authenticated;


-- ============================================================
-- RPC 2
-- USER: cancelar su solicitud
-- ============================================================

create or replace function public.cancel_new_player_registration(
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
    raise exception 'Usuario no autenticado';
  end if;


  update public.player_registration_requests
  set
    status = 'cancelled',
    cancelled_at = now()
  where id = requested_request_id
    and user_id = current_user_id
    and status = 'pending';


  if not found then
    raise exception 'Solicitud pendiente no encontrada';
  end if;

end;
$$;


revoke all
on function public.cancel_new_player_registration(uuid)
from public;

grant execute
on function public.cancel_new_player_registration(uuid)
to authenticated;


-- ============================================================
-- RPC 3
-- ADMIN: aprobar / rechazar
-- ============================================================

create or replace function public.review_new_player_registration(
  requested_request_id uuid,
  decision text,
  notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_admin_id uuid := auth.uid();

  registration_record
    public.player_registration_requests%rowtype;

  normalized_decision text := lower(trim(decision));

  new_player_id uuid;
begin

  if current_admin_id is null then
    raise exception 'Usuario no autenticado';
  end if;


  if not public.has_role(current_admin_id, 'admin') then
    raise exception 'Permisos insuficientes';
  end if;


  if normalized_decision not in ('approved', 'rejected') then
    raise exception 'Decision invalida';
  end if;


  select *
  into registration_record
  from public.player_registration_requests
  where id = requested_request_id
  for update;


  if not found then
    raise exception 'Solicitud no encontrada';
  end if;


  if registration_record.status <> 'pending' then
    raise exception 'La solicitud ya fue revisada';
  end if;


  -- ==========================================================
  -- REJECT
  -- ==========================================================

  if normalized_decision = 'rejected' then

    update public.player_registration_requests
    set
      status = 'rejected',
      reviewed_at = now(),
      reviewed_by = current_admin_id,
      admin_notes = notes
    where id = requested_request_id;


    return null;

  end if;


  -- ==========================================================
  -- APPROVE
  -- ==========================================================

  -- Evita crear un segundo player si la cuenta fue vinculada
  -- mientras esta solicitud estaba pendiente.
  if exists (
    select 1
    from public.players
    where user_id = registration_record.user_id
  ) then
    raise exception 'El usuario ya tiene un perfil deportivo vinculado';
  end if;


  insert into public.players (
    user_id,
    display_name,
    position,
    category,
    status
  )
  values (
    registration_record.user_id,
    registration_record.display_name,
    registration_record.position,
    registration_record.category,
    'free'
  )
  returning id
  into new_player_id;


  update public.player_registration_requests
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = current_admin_id,
    admin_notes = notes,
    created_player_id = new_player_id
  where id = requested_request_id;


  -- Si, mientras tanto, el usuario generó accidentalmente
  -- un claim histórico, lo dejamos cancelado para evitar
  -- solicitudes inconsistentes.
  update public.player_claims
  set
    status = 'cancelled',
    reviewed_at = now(),
    reviewed_by = current_admin_id,
    admin_notes =
      coalesce(admin_notes || ' | ', '') ||
      'Cancelado automaticamente: usuario vinculado a un jugador nuevo.'
  where user_id = registration_record.user_id
    and status = 'pending';


  return new_player_id;

end;
$$;


revoke all
on function public.review_new_player_registration(uuid, text, text)
from public;

grant execute
on function public.review_new_player_registration(uuid, text, text)
to authenticated;


commit;
