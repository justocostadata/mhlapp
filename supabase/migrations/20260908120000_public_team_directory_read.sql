begin;

-- MHLApp: lectura publica minima para directorio deportivo.
-- Permite que /equipos muestre coaches activos y sus nombres.
-- Las escrituras siguen restringidas por las policies existentes.

alter table public.team_coaches enable row level security;
alter table public.profiles enable row level security;

-- Coaches activos visibles como informacion deportiva publica.
drop policy if exists "Public read active team coaches" on public.team_coaches;
create policy "Public read active team coaches"
on public.team_coaches
for select
to anon, authenticated
using (left_at is null);

-- Solo perfiles activos son visibles publicamente.
-- Admin conserva acceso adicional por la policy existente.
drop policy if exists "Public read active profiles" on public.profiles;
create policy "Public read active profiles"
on public.profiles
for select
to anon, authenticated
using (status = 'active');

grant select on public.team_coaches to anon, authenticated;
grant select on public.profiles to anon, authenticated;

commit;
