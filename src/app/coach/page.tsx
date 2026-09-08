import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  requestAddPlayer,
  requestRemovePlayer,
  cancelRosterRequest,
} from "./actions";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function CoachPage({ searchParams }: Props) {
  const { user } = await requireRole("coach");
  const supabase = await createClient();
  const { q } = await searchParams;
  const searchQuery = q?.trim() || "";

  // 1. Fetch active team directed by this coach
  const { data: activeCoachRecord } = await supabase
    .from("team_coaches")
    .select("id, team_id, joined_at")
    .eq("user_id", user.id)
    .is("left_at", null)
    .maybeSingle();

  if (!activeCoachRecord) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-green)]">Panel Director Técnico</p>
        <h1 className="mt-2 text-4xl font-black uppercase tracking-[-0.04em]">Mi Equipo</h1>
        <div className="mt-8 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-8 text-center">
          <p className="text-lg font-bold text-[var(--mhl-text)]">No tenés ningún equipo asignado actualmente</p>
          <p className="mt-2 text-sm text-[var(--mhl-muted)]">
            Tu cuenta posee el rol de Coach, pero todavía no fuiste asignado como Director Técnico a ninguna franquicia activa.
            Contactá a la administración de la liga para asignarte tu equipo.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-block rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--mhl-text)] hover:border-[var(--mhl-green)]"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const teamId = activeCoachRecord.team_id;

  // 2. Fetch team details, all active coaches, active roster, pending roster requests, and competitive matches
  const [
    teamResult,
    coachesResult,
    rosterMembersResult,
    pendingRequestsResult,
    teamMatchesResult,
  ] = await Promise.all([
    supabase.from("teams").select("id, name, short_name, logo_url, active").eq("id", teamId).single(),
    supabase.from("team_coaches").select("id, user_id, joined_at").eq("team_id", teamId).is("left_at", null),
    supabase.from("team_members").select("id, player_id, joined_at").eq("team_id", teamId).is("left_at", null),
    supabase
      .from("team_roster_requests")
      .select("id, team_id, player_id, request_type, status, reason, requested_at")
      .eq("team_id", teamId)
      .eq("status", "pending")
      .order("requested_at", { ascending: false }),
    supabase
      .from("matches")
      .select("id, match_type, scheduled_at, venue_name, pitch, status, home_team_id, away_team_id, team_price, matchday")
      .eq("match_type", "competition")
      .in("status", ["open", "full", "confirmed", "in_progress"])
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .order("scheduled_at", { ascending: true, nullsFirst: false }),
  ]);

  const team = teamResult.data;
  const teamCoaches = coachesResult.data ?? [];
  const rosterMembers = rosterMembersResult.data ?? [];
  const pendingRequests = pendingRequestsResult.data ?? [];
  const competitiveMatches = teamMatchesResult.data ?? [];

  // Fetch rival teams and team financials for competitive matches
  const rivalTeamIds = Array.from(
    new Set(
      competitiveMatches
        .map((m) => (m.home_team_id === teamId ? m.away_team_id : m.home_team_id))
        .filter(Boolean) as string[]
    )
  );
  const compMatchIds = competitiveMatches.map((m) => m.id);

  const [{ data: rivalTeamsData }, { data: teamFinancialsData }] = await Promise.all([
    rivalTeamIds.length > 0
      ? supabase.from("teams").select("id, name, short_name, logo_url").in("id", rivalTeamIds)
      : { data: [] },
    compMatchIds.length > 0
      ? supabase
          .from("match_team_financials")
          .select("id, match_id, team_id, amount_due")
          .eq("team_id", teamId)
          .in("match_id", compMatchIds)
      : { data: [] },
  ]);

  const rivalTeamsMap = new Map((rivalTeamsData ?? []).map((t) => [t.id, t]));
  const teamFinancialsMap = new Map((teamFinancialsData ?? []).map((f) => [f.match_id, f]));

  const compFinancialIds = (teamFinancialsData ?? []).map((f) => f.id);
  const { data: teamPaymentsData } = compFinancialIds.length > 0
    ? await supabase
        .from("match_team_payments")
        .select("id, financial_id, kind, amount, voided_at")
        .in("financial_id", compFinancialIds)
        .is("voided_at", null)
    : { data: [] };

  const teamPaymentsByFinancialId = new Map<string, Array<{ kind: string; amount: number }>>();
  for (const p of teamPaymentsData ?? []) {
    const list = teamPaymentsByFinancialId.get(p.financial_id) ?? [];
    list.push(p);
    teamPaymentsByFinancialId.set(p.financial_id, list);
  }

  // Fetch coach profiles
  const coachUserIds = Array.from(new Set(teamCoaches.map((c) => c.user_id)));
  const { data: coachProfiles } = coachUserIds.length > 0
    ? await supabase.from("profiles").select("id, display_name").in("id", coachUserIds)
    : { data: [] };
  const coachProfilesMap = new Map((coachProfiles ?? []).map((p) => [p.id, p]));

  // Fetch roster players
  const rosterPlayerIds = Array.from(new Set(rosterMembers.map((m) => m.player_id)));
  const { data: rosterPlayersData } = rosterPlayerIds.length > 0
    ? await supabase
        .from("players")
        .select("id, display_name, position, category, jersey_number")
        .in("id", rosterPlayerIds)
    : { data: [] };
  const rosterPlayersMap = new Map((rosterPlayersData ?? []).map((p) => [p.id, p]));

  // Fetch pending request players
  const pendingPlayerIds = Array.from(new Set(pendingRequests.map((r) => r.player_id)));
  const { data: pendingPlayersData } = pendingPlayerIds.length > 0
    ? await supabase
        .from("players")
        .select("id, display_name, position, category")
        .in("id", pendingPlayerIds)
    : { data: [] };
  const pendingPlayersMap = new Map((pendingPlayersData ?? []).map((p) => [p.id, p]));

  // 3. If coach searches for players to incorporate
  let searchResults: Array<{
    id: string;
    display_name: string;
    position: string | null;
    category: string | null;
    isOwnRoster: boolean;
    otherTeamName: string | null;
    hasPendingRequest: boolean;
  }> = [];

  if (searchQuery.length >= 2) {
    const { data: foundPlayers } = await supabase
      .from("players")
      .select("id, display_name, position, category")
      .ilike("display_name", `%${searchQuery}%`)
      .limit(10);

    if (foundPlayers && foundPlayers.length > 0) {
      const foundIds = foundPlayers.map((p) => p.id);

      // Check current memberships of these players
      const { data: activeMemberships } = await supabase
        .from("team_members")
        .select("id, player_id, team_id")
        .in("player_id", foundIds)
        .is("left_at", null);

      const playerTeamMap = new Map((activeMemberships ?? []).map((m) => [m.player_id, m.team_id]));

      // Fetch team names for players with active teams
      const otherTeamIds = Array.from(
        new Set(
          (activeMemberships ?? [])
            .map((m) => m.team_id)
            .filter((tid) => tid !== teamId)
        )
      );

      const { data: otherTeamsData } = otherTeamIds.length > 0
        ? await supabase.from("teams").select("id, name").in("id", otherTeamIds)
        : { data: [] };
      const otherTeamsMap = new Map((otherTeamsData ?? []).map((t) => [t.id, t.name]));

      const pendingSet = new Set(pendingPlayerIds);

      searchResults = foundPlayers.map((p) => {
        const assignedTeamId = playerTeamMap.get(p.id);
        const isOwn = assignedTeamId === teamId;
        const otherTeam = assignedTeamId && assignedTeamId !== teamId ? otherTeamsMap.get(assignedTeamId) ?? "Otro equipo" : null;
        const isPending = pendingSet.has(p.id);

        return {
          id: p.id,
          display_name: p.display_name,
          position: p.position,
          category: p.category,
          isOwnRoster: Boolean(isOwn),
          otherTeamName: otherTeam,
          hasPendingRequest: isPending,
        };
      });
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-green)]">Panel Director Técnico</p>
          <h1 className="mt-2 text-4xl font-black uppercase tracking-[-0.04em]">{team?.name ?? "Mi Equipo"}</h1>
          {team?.short_name && (
            <p className="mt-1 text-sm font-bold uppercase tracking-wider text-[var(--mhl-muted)]">
              Franquicia: {team.short_name}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-4 py-3 text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--mhl-muted)]">Jugadores activos</p>
          <p className="text-2xl font-black text-[var(--mhl-green)]">{rosterMembers.length}</p>
        </div>
      </div>

      {/* CUERPO TÉCNICO (COACHES) */}
      <section className="mt-8 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--mhl-muted)]">Cuerpo Técnico</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {teamCoaches.map((c) => {
            const profile = coachProfilesMap.get(c.user_id);
            const isMe = c.user_id === user.id;
            return (
              <span
                key={c.id}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold ${
                  isMe
                    ? "border-[var(--mhl-green)]/40 bg-[var(--mhl-green)]/15 text-[var(--mhl-green)]"
                    : "border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] text-[var(--mhl-text)]"
                }`}
              >
                {profile?.display_name || c.user_id}
                {isMe && <span className="text-[10px] opacity-75">(Vos)</span>}
              </span>
            );
          })}
        </div>
      </section>

      {/* PRÓXIMOS PARTIDOS COMPETITIVOS */}
      <section className="mt-8 space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-green)]">Fixture Oficial</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Próximos Partidos Competitivos</h2>
          <p className="mt-1 text-xs text-[var(--mhl-muted)]">
            Consultá los compromisos oficiales de tu franquicia, estado de citaciones y finanzas del equipo. Abrí el partido para convocar jugadores de tu plantilla.
          </p>
        </div>

        {competitiveMatches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-8 text-center text-sm text-[var(--mhl-muted)]">
            No hay partidos competitivos programados para tu equipo actualmente.
          </div>
        ) : (
          <div className="space-y-3">
            {competitiveMatches.map((m) => {
              const isHome = m.home_team_id === teamId;
              const rivalId = isHome ? m.away_team_id : m.home_team_id;
              const rival = rivalId ? rivalTeamsMap.get(rivalId) : null;
              const fin = teamFinancialsMap.get(m.id);
              const payments = fin ? (teamPaymentsByFinancialId.get(fin.id) ?? []) : [];

              const amountDue = fin?.amount_due ?? m.team_price ?? 0;
              let paid = 0;
              let waiver = 0;
              for (const p of payments) {
                if (p.kind === "payment") paid += p.amount;
                if (p.kind === "waiver") waiver += p.amount;
              }
              const balance = Math.max(0, amountDue - paid - waiver);

              return (
                <article
                  key={m.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5 transition hover:border-[#3e4c44] sm:flex-row sm:items-center"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                        isHome ? "bg-blue-500/15 text-blue-400 border border-blue-500/30" : "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                      }`}>
                        {isHome ? "Local" : "Visitante"}
                      </span>
                      <span className="rounded-md border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--mhl-muted)]">
                        Estado: {m.status}
                      </span>
                      {m.scheduled_at && (
                        <span className="font-bold text-[var(--mhl-muted)]">
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

                    <h3 className="text-xl font-black uppercase tracking-tight">
                      <span className="text-[var(--mhl-muted)]">vs</span> {rival?.name || "Rival a definir"}
                    </h3>

                    <p className="text-xs text-[var(--mhl-muted)]">
                      {m.venue_name || "Lugar a designar"} {m.pitch ? `· Cancha ${m.pitch}` : ""}
                      {m.matchday ? ` · Fecha ${m.matchday}` : ""}
                    </p>

                    {/* FINANZAS DEL EQUIPO */}
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                      <span className="text-[var(--mhl-muted)]">
                        Precio Equipo: <strong className="text-[var(--mhl-text)]">${amountDue.toLocaleString("es-AR")}</strong>
                      </span>
                      <span className="text-[var(--mhl-muted)]">
                        Abonado: <strong className="text-[var(--mhl-green)]">${paid.toLocaleString("es-AR")}</strong>
                      </span>
                      <span className="text-[var(--mhl-muted)]">
                        Saldo: <strong className={balance > 0 ? "text-[var(--mhl-red)]" : "text-[var(--mhl-green)]"}>
                          ${balance.toLocaleString("es-AR")}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div>
                    <Link
                      href={`/coach/partidos/${m.id}`}
                      className="inline-block w-full sm:w-auto rounded-xl bg-[var(--mhl-green)] px-5 py-3 text-center text-xs font-black uppercase tracking-wider text-[#080b0a] shadow-lg transition hover:brightness-110"
                    >
                      Ver Convocatoria &rarr;
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* SOLICITUDES PENDIENTES */}
      {pendingRequests.length > 0 && (
        <section className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-yellow)]">En revisión</p>
              <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Solicitudes enviadas al Admin</h2>
            </div>
            <span className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-3 py-1 text-xs font-black text-[var(--mhl-yellow)]">
              {pendingRequests.length} pendiente{pendingRequests.length > 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-3">
            {pendingRequests.map((req) => {
              const reqPlayer = pendingPlayersMap.get(req.player_id);
              const isAdd = req.request_type === "add";

              return (
                <article
                  key={req.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                          isAdd
                            ? "border border-[var(--mhl-green)]/40 bg-[var(--mhl-green)]/15 text-[var(--mhl-green)]"
                            : "border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/15 text-[var(--mhl-red)]"
                        }`}
                      >
                        {isAdd ? "Incorporación" : "Baja solicitada"}
                      </span>
                      <span className="text-xs text-[var(--mhl-muted)]">·</span>
                      <span className="text-xs text-[var(--mhl-muted)]">
                        {new Date(req.requested_at).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>

                    <h3 className="mt-2 text-lg font-black uppercase tracking-tight">
                      {reqPlayer?.display_name ?? "Jugador"}
                    </h3>

                    {req.reason && (
                      <p className="mt-1 text-xs text-[var(--mhl-muted)]">
                        Motivo: <span className="italic text-[var(--mhl-text)]">&ldquo;{req.reason}&rdquo;</span>
                      </p>
                    )}
                  </div>

                  <form action={cancelRosterRequest}>
                    <input type="hidden" name="requestId" value={req.id} />
                    <button
                      type="submit"
                      className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-muted)] transition hover:border-[var(--mhl-red)] hover:text-[var(--mhl-red)]"
                    >
                      Cancelar solicitud
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* PLANTILLA ACTIVA */}
      <section className="mt-10 space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-green)]">Plantilla oficial</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Jugadores del Equipo</h2>
          <p className="mt-1 text-xs text-[var(--mhl-muted)]">
            Para desvincular a un jugador de tu plantilla, solicitá su baja. La misma quedará pendiente de aprobación del Administrador.
          </p>
        </div>

        {rosterMembers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] p-8 text-center text-sm text-[var(--mhl-muted)]">
            Este equipo no tiene jugadores asignados actualmente. Podés buscar jugadores libres abajo para solicitar su incorporación.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rosterMembers.map((m) => {
              const p = rosterPlayersMap.get(m.player_id);
              return (
                <article
                  key={m.id}
                  className="flex flex-col justify-between rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5 transition hover:border-[#3d4d44]"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-[var(--mhl-panel-2)] px-2 py-0.5 text-xs font-black text-[var(--mhl-green)]">
                        {p?.jersey_number ? `#${p.jersey_number}` : "—"}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--mhl-muted)]">
                        {p?.position ?? "Jugador"}
                      </span>
                    </div>

                    <h3 className="mt-3 text-lg font-black uppercase tracking-tight">
                      {p?.display_name ?? "Jugador"}
                    </h3>

                    <p className="mt-1 text-xs text-[var(--mhl-muted)]">
                      Categoría: {p?.category ?? "General"}
                    </p>
                  </div>

                  <form action={requestRemovePlayer} className="mt-5 border-t border-[var(--mhl-border)]/60 pt-3">
                    <input type="hidden" name="playerId" value={m.player_id} />
                    <input
                      type="text"
                      name="reason"
                      placeholder="Motivo de la baja (opcional)"
                      className="mb-2 w-full rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-2.5 py-1.5 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:border-[var(--mhl-red)] focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="w-full rounded-xl border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/10 px-3 py-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-red)] transition hover:bg-[var(--mhl-red)]/20"
                    >
                      Solicitar baja
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* INCORPORAR JUGADOR LIBRE */}
      <section className="mt-12 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-green)]">Gestión de plantilla</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Incorporar Jugador</h2>
          <p className="mt-1 text-xs text-[var(--mhl-muted)]">
            Buscá jugadores registrados en la liga. Si un jugador ya pertenece a otro equipo activo, no podrá ser incorporado directamente ya que requiere trámite de Traspaso.
          </p>
        </div>

        {/* Formulario de búsqueda GET */}
        <form method="get" action="/coach" className="mt-5 flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={searchQuery}
            placeholder="Buscar jugador por nombre o apellido..."
            className="flex-1 rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-4 py-2.5 text-sm text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:border-[var(--mhl-green)] focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-xl bg-[var(--mhl-green)] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
          >
            Buscar
          </button>
        </form>

        {/* Resultados de búsqueda */}
        {searchQuery.length >= 2 && (
          <div className="mt-6 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--mhl-muted)]">
              Resultados para &ldquo;{searchQuery}&rdquo; ({searchResults.length})
            </p>

            {searchResults.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--mhl-border)] p-6 text-center text-xs text-[var(--mhl-muted)]">
                No se encontraron jugadores que coincidan con la búsqueda.
              </p>
            ) : (
              searchResults.map((player) => (
                <div
                  key={player.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <h4 className="text-base font-black uppercase tracking-tight">
                      {player.display_name}
                    </h4>
                    <p className="text-xs text-[var(--mhl-muted)]">
                      {player.position} {player.category ? `· ${player.category}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 sm:self-center">
                    {player.isOwnRoster ? (
                      <span className="rounded-lg border border-[var(--mhl-green)]/40 bg-[var(--mhl-green)]/15 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[var(--mhl-green)]">
                        En tu plantilla
                      </span>
                    ) : player.otherTeamName ? (
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg border border-[var(--mhl-yellow)]/50 bg-[var(--mhl-yellow)]/15 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[var(--mhl-yellow)]">
                          Requiere traspaso
                        </span>
                        <span className="text-xs text-[var(--mhl-muted)]">
                          ({player.otherTeamName})
                        </span>
                      </div>
                    ) : player.hasPendingRequest ? (
                      <span className="rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[var(--mhl-muted)]">
                        Solicitud pendiente
                      </span>
                    ) : (
                      <form action={requestAddPlayer} className="flex items-center gap-2">
                        <input type="hidden" name="playerId" value={player.id} />
                        <input
                          type="text"
                          name="reason"
                          placeholder="Motivo / observación"
                          className="w-48 rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2.5 py-1.5 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:border-[var(--mhl-green)] focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-[var(--mhl-green)] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                        >
                          Solicitar incorporación
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </main>
  );
}
