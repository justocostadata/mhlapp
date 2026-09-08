import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/stat-card";
import {
  approvePlayerClaim,
  rejectPlayerClaim,
  approveNewPlayerRegistration,
  rejectNewPlayerRegistration,
  assignCoach,
  removeCoach,
  approveRosterRequest,
  rejectRosterRequest,
  createFriendlyMatch,
  publishMatch,
  assignScorekeeper,
  removeScorekeeper,
} from "./actions";

export default async function AdminPage() {
  const { user, roles } = await requireRole("admin");
  const supabase = await createClient();

  const [
    playersCount,
    teamsCount,
    matchesCount,
    claimsCountResult,
    registrationsCountResult,
    rosterRequestsCountResult,
    rawClaimsResult,
    rawRegistrationsResult,
    rawRosterRequestsResult,
    rawTeamsResult,
    rawActiveCoachesResult,
    rawActiveMembersResult,
    rawAllProfilesResult,
    rawMatchesResult,
    rawMatchPlayersResult,
  ] = await Promise.all([
    supabase.from("players").select("id", { count: "exact", head: true }),
    supabase.from("teams").select("id", { count: "exact", head: true }),
    supabase.from("matches").select("id", { count: "exact", head: true }),
    supabase.from("player_claims").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("player_registration_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("team_roster_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("player_claims")
      .select("id, player_id, user_id, requested_at, status, admin_notes")
      .eq("status", "pending")
      .order("requested_at", { ascending: false }),
    supabase
      .from("player_registration_requests")
      .select("id, display_name, position, category, user_id, requested_at, status, admin_notes")
      .eq("status", "pending")
      .order("requested_at", { ascending: false }),
    supabase
      .from("team_roster_requests")
      .select("id, team_id, player_id, request_type, status, reason, requested_at, admin_notes")
      .eq("status", "pending")
      .order("requested_at", { ascending: false }),
    supabase.from("teams").select("id, name, short_name, active, logo_url").order("name"),
    supabase.from("team_coaches").select("id, team_id, user_id, joined_at, left_at").is("left_at", null),
    supabase.from("team_members").select("id, team_id, player_id, joined_at, left_at").is("left_at", null),
    supabase.from("profiles").select("id, display_name").order("display_name"),
    supabase
      .from("matches")
      .select("id, match_type, scheduled_at, venue_name, pitch, status, player_price, max_players, scorekeeper_user_id, created_at")
      .order("scheduled_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("match_players")
      .select("id, match_id, participation_status")
      .neq("participation_status", "cancelled"),
  ]);

  const pendingClaimsList = rawClaimsResult.data ?? [];
  const pendingRegistrationsList = rawRegistrationsResult.data ?? [];
  const pendingRosterRequestsList = rawRosterRequestsResult.data ?? [];
  const allTeamsList = rawTeamsResult.data ?? [];
  const activeCoachesList = rawActiveCoachesResult.data ?? [];
  const activeMembersList = rawActiveMembersResult.data ?? [];
  const allProfilesList = rawAllProfilesResult.data ?? [];
  const allMatchesList = rawMatchesResult.data ?? [];
  const allActiveMatchPlayersList = rawMatchPlayersResult.data ?? [];

  const matchActivePlayersCountMap = new Map<string, number>();
  for (const mp of allActiveMatchPlayersList) {
    matchActivePlayersCountMap.set(mp.match_id, (matchActivePlayersCountMap.get(mp.match_id) ?? 0) + 1);
  }

  const matchStatusStyles: Record<string, { bg: string; label: string }> = {
    draft: { bg: "bg-neutral-800 text-neutral-300 border-neutral-700", label: "Borrador (Draft)" },
    open: { bg: "bg-[var(--mhl-green)]/15 text-[var(--mhl-green)] border-[var(--mhl-green)]/30", label: "Inscripción Abierta" },
    full: { bg: "bg-[var(--mhl-yellow)]/15 text-[var(--mhl-yellow)] border-[var(--mhl-yellow)]/30", label: "Cupo Lleno" },
    confirmed: { bg: "bg-blue-500/15 text-blue-400 border-blue-500/30", label: "Confirmado" },
    in_progress: { bg: "bg-purple-500/15 text-purple-400 border-purple-500/30", label: "En Juego" },
    completed: { bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Finalizado" },
    cancelled: { bg: "bg-[var(--mhl-red)]/15 text-[var(--mhl-red)] border-[var(--mhl-red)]/30", label: "Cancelado" },
  };

  // Lookup data
  const teamsMap = new Map(allTeamsList.map((t) => [t.id, t]));
  const profilesMap = new Map(allProfilesList.map((p) => [p.id, p]));

  // Active coach user set to easily know who is currently coaching
  const activeCoachUserIdToTeam = new Map<string, string>();
  for (const c of activeCoachesList) {
    activeCoachUserIdToTeam.set(c.user_id, c.team_id);
  }

  // Active player count per team
  const teamMemberCountMap = new Map<string, number>();
  for (const m of activeMembersList) {
    teamMemberCountMap.set(m.team_id, (teamMemberCountMap.get(m.team_id) ?? 0) + 1);
  }

  // Active coaches per team
  const teamCoachesMap = new Map<string, typeof activeCoachesList>();
  for (const c of activeCoachesList) {
    const list = teamCoachesMap.get(c.team_id) ?? [];
    list.push(c);
    teamCoachesMap.set(c.team_id, list);
  }

  // Players lookup needed for claims and roster requests
  const playerIdsToFetch = Array.from(
    new Set([
      ...pendingClaimsList.map((c) => c.player_id),
      ...pendingRosterRequestsList.map((r) => r.player_id),
    ].filter(Boolean))
  );

  const { data: playersData } = playerIdsToFetch.length > 0
    ? await supabase.from("players").select("id, display_name, position, category").in("id", playerIdsToFetch)
    : { data: [] };

  const playersMap = new Map((playersData ?? []).map((p) => [p.id, p]));

  const totalPending =
    (claimsCountResult.count ?? 0) +
    (registrationsCountResult.count ?? 0) +
    (rosterRequestsCountResult.count ?? 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-red)]">Administrador</p>
      <h1 className="mt-2 text-4xl font-black uppercase tracking-[-0.04em]">Control MHL</h1>
      <p className="mt-3 text-sm text-[var(--mhl-muted)]">{user.email} · {roles.join(" · ")}</p>

      {/* DASHBOARD STATS */}
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Jugadores" value={playersCount.count ?? "—"} />
        <StatCard label="Equipos" value={teamsCount.count ?? "—"} />
        <StatCard label="Partidos" value={matchesCount.count ?? "—"} />
        <StatCard label="Solicitudes pendientes" value={totalPending} />
      </div>

      {/* SECCIÓN: MOTOR DEL PARTIDO */}
      <section className="mt-12 space-y-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-green)]">Competición & Motor</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Motor del Partido</h2>
          <p className="mt-1 text-sm text-[var(--mhl-muted)]">
            Creá y administrá partidos amistosos y de competencia. El partido nace como borrador (<code className="text-xs text-[var(--mhl-text)]">draft</code>) y luego se publica y asigna staff planillero.
          </p>
        </div>

        {/* FORMULARIO CREAR AMISTOSO */}
        <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
          <h3 className="text-lg font-black uppercase tracking-tight">Crear Partido Amistoso</h3>
          <p className="mt-0.5 text-xs text-[var(--mhl-muted)]">
            Configurá los detalles del amistoso para abrir inscripción a los jugadores usando <code className="text-[var(--mhl-green)]">create_match_v1</code>.
          </p>

          <form action={createFriendlyMatch} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Fecha</label>
              <input
                type="date"
                name="date"
                required
                className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Hora</label>
              <input
                type="time"
                name="time"
                required
                className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Predio / Lugar (venue_name)</label>
              <input
                type="text"
                name="venue_name"
                placeholder="Ej. Sede Central MHL / Predio Norte"
                className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:border-[var(--mhl-green)] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Cancha (pitch)</label>
              <input
                type="text"
                name="pitch"
                placeholder="Ej. Cancha 1 (Sintético)"
                className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:border-[var(--mhl-green)] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Precio por jugador ($)</label>
              <input
                type="number"
                name="player_price"
                placeholder="0"
                min="0"
                step="any"
                required
                className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Cupo máximo de jugadores</label>
              <input
                type="number"
                name="max_players"
                placeholder="Ej. 14 o 20"
                min="1"
                required
                className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                className="rounded-xl bg-[var(--mhl-green)] px-6 py-2.5 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
              >
                Crear Amistoso (Draft)
              </button>
            </div>
          </form>
        </div>

        {/* LISTADO DE PARTIDOS EN EL MOTOR */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black uppercase tracking-tight">Partidos Registrados en el Motor</h3>
            <span className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-3 py-1 text-xs font-black">
              {allMatchesList.length} total
            </span>
          </div>

          {allMatchesList.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] p-6 text-center text-sm text-[var(--mhl-muted)]">
              No hay partidos registrados todavía en el motor.
            </div>
          ) : (
            <div className="space-y-3">
              {allMatchesList.map((m) => {
                const activeCount = matchActivePlayersCountMap.get(m.id) ?? 0;
                const scorekeeper = m.scorekeeper_user_id ? profilesMap.get(m.scorekeeper_user_id) : null;
                const statusBadge = matchStatusStyles[m.status] || { bg: "bg-neutral-800 text-neutral-300 border-neutral-700", label: m.status };

                return (
                  <article
                    key={m.id}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5 transition hover:border-[#45524c] lg:flex-row lg:items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-lg border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusBadge.bg}`}>
                          {statusBadge.label}
                        </span>
                        <span className="rounded-md border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-2 py-0.5 text-[10px] font-black uppercase text-[var(--mhl-muted)]">
                          {m.match_type}
                        </span>
                        {m.scheduled_at && (
                          <span className="text-xs font-bold text-[var(--mhl-muted)]">
                            {new Date(m.scheduled_at).toLocaleDateString("es-AR", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>

                      <h4 className="mt-2 text-lg font-black uppercase tracking-tight">
                        {m.venue_name || "Lugar a definir"} {m.pitch ? `· Cancha ${m.pitch}` : ""}
                      </h4>

                      <div className="mt-1 flex flex-wrap gap-4 text-xs text-[var(--mhl-muted)]">
                        <span>Inscriptos: <strong className="text-[var(--mhl-green)]">{activeCount} / {m.max_players ?? "—"}</strong></span>
                        <span>Precio: <strong className="text-[var(--mhl-text)]">${m.player_price?.toLocaleString("es-AR") ?? "0"}</strong></span>
                        <span>Planillero: <strong className={scorekeeper ? "text-[var(--mhl-yellow)]" : "text-[var(--mhl-muted)]"}>{scorekeeper?.display_name ?? (m.scorekeeper_user_id ? "Asignado" : "Sin asignar")}</strong></span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:self-center">
                      {m.status === "draft" && (
                        <form action={publishMatch}>
                          <input type="hidden" name="matchId" value={m.id} />
                          <button
                            type="submit"
                            className="rounded-xl bg-[var(--mhl-green)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                          >
                            Publicar
                          </button>
                        </form>
                      )}

                      {/* Asignar planillero */}
                      <form action={assignScorekeeper} className="flex items-center gap-1.5">
                        <input type="hidden" name="matchId" value={m.id} />
                        <select
                          name="userId"
                          defaultValue={m.scorekeeper_user_id || ""}
                          className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-2.5 py-1.5 text-xs text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none"
                        >
                          <option value="" disabled>Planillero...</option>
                          {allProfilesList.map((prof) => (
                            <option key={prof.id} value={prof.id}>
                              {prof.display_name || prof.id}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[var(--mhl-muted)] transition hover:text-[var(--mhl-yellow)]"
                        >
                          {m.scorekeeper_user_id ? "Cambiar" : "Asignar"}
                        </button>
                      </form>

                      {m.scorekeeper_user_id && (
                        <form action={removeScorekeeper}>
                          <input type="hidden" name="matchId" value={m.id} />
                          <button
                            type="submit"
                            title="Quitar planillero"
                            className="rounded-xl border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/10 px-2.5 py-1.5 text-xs font-black text-[var(--mhl-red)] transition hover:bg-[var(--mhl-red)]/20"
                          >
                            &times;
                          </button>
                        </form>
                      )}

                      <Link
                        href={`/admin/partidos/${m.id}`}
                        className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-text)] transition hover:border-[var(--mhl-green)]"
                      >
                        Gestionar & Finanzas &rarr;
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* SECCIÓN 1: SOLICITUDES DE PLANTILLA (ADD / REMOVE) */}
      <section className="mt-12 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-green)]">Plantillas y Equipos</p>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Solicitudes de plantilla (Coach)</h2>
          </div>
          <span className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-3 py-1 text-xs font-black">
            {pendingRosterRequestsList.length} {pendingRosterRequestsList.length === 1 ? "pendiente" : "pendientes"}
          </span>
        </div>

        {pendingRosterRequestsList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] p-6 text-center text-sm text-[var(--mhl-muted)]">
            No hay solicitudes de plantilla pendientes de los coaches.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRosterRequestsList.map((req) => {
              const reqPlayer = playersMap.get(req.player_id);
              const reqTeam = teamsMap.get(req.team_id);
              const isAdd = req.request_type === "add";

              return (
                <article
                  key={req.id}
                  className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5 transition hover:border-[#45524c]"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                            isAdd
                              ? "border border-[var(--mhl-green)]/40 bg-[var(--mhl-green)]/15 text-[var(--mhl-green)]"
                              : "border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/15 text-[var(--mhl-red)]"
                          }`}
                        >
                          {isAdd ? "Incorporación (ADD)" : "Baja de plantilla (REMOVE)"}
                        </span>
                        <span className="text-xs text-[var(--mhl-muted)]">·</span>
                        <span className="text-xs text-[var(--mhl-muted)]">
                          {new Date(req.requested_at).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      <h3 className="text-xl font-black uppercase tracking-tight">
                        {reqPlayer?.display_name ?? "Jugador desconocido"}
                      </h3>

                      <p className="text-xs text-[var(--mhl-muted)]">
                        Equipo: <span className="font-bold text-[var(--mhl-text)]">{reqTeam?.name ?? "Equipo"}</span>
                        {reqPlayer?.position ? ` · Posición: ${reqPlayer.position}` : ""}
                        {reqPlayer?.category ? ` · Categoría: ${reqPlayer.category}` : ""}
                      </p>

                      {req.reason && (
                        <p className="text-xs text-[var(--mhl-muted)]">
                          Motivo del Coach: <span className="italic text-[var(--mhl-text)]">&ldquo;{req.reason}&rdquo;</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 sm:self-center">
                      <form action={rejectRosterRequest}>
                        <input type="hidden" name="requestId" value={req.id} />
                        <button
                          type="submit"
                          className="rounded-xl border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--mhl-red)] transition hover:bg-[var(--mhl-red)]/20"
                        >
                          Rechazar
                        </button>
                      </form>

                      <form action={approveRosterRequest}>
                        <input type="hidden" name="requestId" value={req.id} />
                        <button
                          type="submit"
                          className="rounded-xl bg-[var(--mhl-green)] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                        >
                          Aprobar
                        </button>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* SECCIÓN 2: GESTIÓN DE EQUIPOS Y COACHES */}
      <section className="mt-12 space-y-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-green)]">Administración deportiva</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Gestión de Equipos y Coaches</h2>
          <p className="mt-1 text-sm text-[var(--mhl-muted)]">
            Asigná directores técnicos a los equipos o remové coaches activos. Al asignar, el sistema otorga el rol automáticamente.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {allTeamsList.map((team) => {
            const teamCoaches = teamCoachesMap.get(team.id) ?? [];
            const memberCount = teamMemberCountMap.get(team.id) ?? 0;

            return (
              <article
                key={team.id}
                className="flex flex-col justify-between rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6"
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-black uppercase tracking-tight">{team.name}</h3>
                    {team.short_name && (
                      <span className="rounded-md border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">
                        {team.short_name}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-4 text-xs text-[var(--mhl-muted)]">
                    <span>
                      Jugadores activos: <strong className="text-[var(--mhl-text)]">{memberCount}</strong>
                    </span>
                    <span>·</span>
                    <span>
                      Estado: <strong className="text-[var(--mhl-green)]">{team.active ? "Activo" : "Inactivo"}</strong>
                    </span>
                  </div>

                  {/* Coaches actuales */}
                  <div className="mt-5 border-t border-[var(--mhl-border)]/60 pt-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--mhl-muted)]">
                      Coaches activos ({teamCoaches.length})
                    </p>

                    {teamCoaches.length === 0 ? (
                      <p className="mt-2 text-xs italic text-[var(--mhl-muted)]">Sin coach asignado</p>
                    ) : (
                      <div className="mt-2.5 space-y-2">
                        {teamCoaches.map((c) => {
                          const coachProfile = profilesMap.get(c.user_id);
                          const coachName = coachProfile?.display_name || c.user_id;

                          return (
                            <div
                              key={c.id}
                              className="flex items-center justify-between gap-2 rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs"
                            >
                              <span className="font-bold text-[var(--mhl-text)]">{coachName}</span>
                              <form action={removeCoach}>
                                <input type="hidden" name="teamCoachId" value={c.id} />
                                <button
                                  type="submit"
                                  className="text-[11px] font-black uppercase tracking-wider text-[var(--mhl-red)] hover:underline"
                                >
                                  Quitar
                                </button>
                              </form>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Asignar nuevo coach */}
                <div className="mt-6 border-t border-[var(--mhl-border)]/60 pt-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--mhl-muted)]">
                    Asignar Coach a {team.name}
                  </p>
                  <form action={assignCoach} className="mt-2.5 flex flex-col gap-2">
                    <input type="hidden" name="teamId" value={team.id} />
                    <select
                      name="userId"
                      required
                      defaultValue=""
                      className="w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2.5 text-xs text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none"
                    >
                      <option value="" disabled>
                        Seleccionar usuario de la lista...
                      </option>
                      {allProfilesList.map((p) => {
                        const existingTeamId = activeCoachUserIdToTeam.get(p.id);
                        const isCoachingOther = existingTeamId && existingTeamId !== team.id;
                        const isCoachingThis = existingTeamId === team.id;
                        const otherTeamName = existingTeamId ? teamsMap.get(existingTeamId)?.name : null;

                        return (
                          <option
                            key={p.id}
                            value={p.id}
                            disabled={Boolean(isCoachingOther || isCoachingThis)}
                          >
                            {p.display_name || p.id}{" "}
                            {isCoachingThis
                              ? "(Ya es coach de este equipo)"
                              : isCoachingOther
                              ? `(Ya dirige: ${otherTeamName})`
                              : ""}
                          </option>
                        );
                      })}
                    </select>

                    <button
                      type="submit"
                      className="w-full rounded-xl bg-[var(--mhl-green)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                    >
                      Asignar Coach
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* SECCIÓN 3: SOLICITUDES DE PERFIL (HISTÓRICOS Y NUEVOS) */}
      <section className="mt-12 space-y-10">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-yellow)]">Gestión de usuarios</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Solicitudes de perfil de jugador</h2>
        </div>

        {/* RECLAMOS HISTÓRICOS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-black uppercase tracking-tight">
              1. Reclamos de jugadores históricos
            </h3>
            <span className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-3 py-1 text-xs font-black">
              {pendingClaimsList.length} {pendingClaimsList.length === 1 ? "pendiente" : "pendientes"}
            </span>
          </div>

          {pendingClaimsList.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] p-6 text-center text-sm text-[var(--mhl-muted)]">
              No hay reclamos históricos pendientes en este momento.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingClaimsList.map((claim) => {
                const claimedPlayer = playersMap.get(claim.player_id);
                const requesterProfile = profilesMap.get(claim.user_id);
                const requesterName = requesterProfile?.display_name || claim.user_id;

                return (
                  <article
                    key={claim.id}
                    className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5 transition hover:border-[#45524c]"
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[var(--mhl-yellow)]" />
                          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--mhl-yellow)]">
                            Pendiente
                          </p>
                          <span className="text-xs text-[var(--mhl-muted)]">·</span>
                          <span className="text-xs text-[var(--mhl-muted)]">
                            {new Date(claim.requested_at).toLocaleDateString("es-AR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        <h4 className="text-xl font-black uppercase tracking-tight">
                          {claimedPlayer?.display_name ?? "Jugador desconocido"}
                        </h4>

                        <p className="text-xs text-[var(--mhl-muted)]">
                          {claimedPlayer?.position ?? "Sin posición"} · {claimedPlayer?.category ?? "Sin categoría"}
                        </p>

                        <p className="pt-2 text-xs text-[var(--mhl-muted)]">
                          Solicitado por: <span className="font-bold text-[var(--mhl-text)]">{requesterName}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 sm:self-center">
                        <form action={rejectPlayerClaim}>
                          <input type="hidden" name="claimId" value={claim.id} />
                          <button
                            type="submit"
                            className="rounded-xl border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--mhl-red)] transition hover:bg-[var(--mhl-red)]/20"
                          >
                            Rechazar
                          </button>
                        </form>

                        <form action={approvePlayerClaim}>
                          <input type="hidden" name="claimId" value={claim.id} />
                          <button
                            type="submit"
                            className="rounded-xl bg-[var(--mhl-green)] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                          >
                            Aprobar
                          </button>
                        </form>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* ALTAS DE JUGADORES NUEVOS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-black uppercase tracking-tight">
              2. Altas de jugadores nuevos
            </h3>
            <span className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-3 py-1 text-xs font-black">
              {pendingRegistrationsList.length} {pendingRegistrationsList.length === 1 ? "pendiente" : "pendientes"}
            </span>
          </div>

          {pendingRegistrationsList.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] p-6 text-center text-sm text-[var(--mhl-muted)]">
              No hay solicitudes de alta de jugadores nuevos pendientes.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRegistrationsList.map((reg) => {
                const requesterProfile = profilesMap.get(reg.user_id);
                const requesterName = requesterProfile?.display_name || reg.user_id;

                return (
                  <article
                    key={reg.id}
                    className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5 transition hover:border-[#45524c]"
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[var(--mhl-yellow)]" />
                          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--mhl-yellow)]">
                            Alta nueva pendiente
                          </p>
                          <span className="text-xs text-[var(--mhl-muted)]">·</span>
                          <span className="text-xs text-[var(--mhl-muted)]">
                            {new Date(reg.requested_at).toLocaleDateString("es-AR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        <h4 className="text-xl font-black uppercase tracking-tight">
                          {reg.display_name}
                        </h4>

                        <p className="text-xs text-[var(--mhl-muted)]">
                          Posición: <span className="font-bold text-[var(--mhl-text)]">{reg.position}</span>
                          {reg.category ? ` · Categoría: ${reg.category}` : ""}
                        </p>

                        <p className="pt-2 text-xs text-[var(--mhl-muted)]">
                          Solicitado por: <span className="font-bold text-[var(--mhl-text)]">{requesterName}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 sm:self-center">
                        <form action={rejectNewPlayerRegistration}>
                          <input type="hidden" name="requestId" value={reg.id} />
                          <button
                            type="submit"
                            className="rounded-xl border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--mhl-red)] transition hover:bg-[var(--mhl-red)]/20"
                          >
                            Rechazar
                          </button>
                        </form>

                        <form action={approveNewPlayerRegistration}>
                          <input type="hidden" name="requestId" value={reg.id} />
                          <button
                            type="submit"
                            className="rounded-xl bg-[var(--mhl-green)] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                          >
                            Crear jugador
                          </button>
                        </form>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
