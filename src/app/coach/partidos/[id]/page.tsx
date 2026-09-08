import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { invitePlayerToMatch } from "../../actions";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CoachMatchPage({ params }: Props) {
  const { user } = await requireRole("coach");
  const { id } = await params;
  const supabase = await createClient();

  // 1. Fetch active team directed by this coach
  const { data: activeCoachRecord } = await supabase
    .from("team_coaches")
    .select("id, team_id, joined_at")
    .eq("user_id", user.id)
    .is("left_at", null)
    .maybeSingle();

  if (!activeCoachRecord) {
    redirect("/coach");
  }

  const coachTeamId = activeCoachRecord.team_id;

  // 2. Fetch match data and verify coach team participation
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("*")
    .eq("id", id)
    .single();

  if (matchError || !match || match.match_type !== "competition") {
    notFound();
  }

  const isHome = match.home_team_id === coachTeamId;
  const isAway = match.away_team_id === coachTeamId;

  if (!isHome && !isAway) {
    // Coach does not direct either team in this match
    redirect("/coach");
  }

  const rivalTeamId = isHome ? match.away_team_id : match.home_team_id;

  // 3. Fetch related data in parallel:
  // - Coach team & Rival team
  // - Active squad members & player details
  // - Existing match players for this match & coach's team
  // - Team financials & payments
  const [
    { data: teamsData },
    { data: squadMembers },
    { data: matchPlayersData },
    { data: teamFinancialsData },
  ] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, short_name, logo_url")
      .in("id", [coachTeamId, rivalTeamId].filter(Boolean) as string[]),
    supabase
      .from("team_members")
      .select("id, player_id, joined_at")
      .eq("team_id", coachTeamId)
      .is("left_at", null),
    supabase
      .from("match_players")
      .select("id, player_id, team_id, side, participation_status, attendance_status, minutes_played")
      .eq("match_id", id)
      .eq("team_id", coachTeamId),
    supabase
      .from("match_team_financials")
      .select("id, match_id, team_id, amount_due")
      .eq("match_id", id)
      .eq("team_id", coachTeamId)
      .maybeSingle(),
  ]);

  const teamsMap = new Map((teamsData ?? []).map((t) => [t.id, t]));
  const myTeam = teamsMap.get(coachTeamId);
  const rivalTeam = rivalTeamId ? teamsMap.get(rivalTeamId) : null;

  // Fetch squad player profiles
  const squadPlayerIds = (squadMembers ?? []).map((m) => m.player_id);
  const { data: playersData } = squadPlayerIds.length > 0
    ? await supabase
        .from("players")
        .select("id, display_name, jersey_number, position, category")
        .in("id", squadPlayerIds)
    : { data: [] };

  const playersMap = new Map((playersData ?? []).map((p) => [p.id, p]));

  // Fetch team payments for financial status
  const financialId = teamFinancialsData?.id;
  const { data: teamPayments } = financialId
    ? await supabase
        .from("match_team_payments")
        .select("id, kind, amount, voided_at")
        .eq("financial_id", financialId)
        .is("voided_at", null)
    : { data: [] };

  const amountDue = teamFinancialsData?.amount_due ?? match.team_price ?? 0;
  let totalPaid = 0;
  let totalWaiver = 0;
  for (const p of teamPayments ?? []) {
    if (p.kind === "payment") totalPaid += p.amount;
    if (p.kind === "waiver") totalWaiver += p.amount;
  }
  const balance = Math.max(0, amountDue - totalPaid - totalWaiver);

  // Map match players by player_id
  const matchPlayerByPlayerId = new Map(
    (matchPlayersData ?? []).map((mp) => [mp.player_id, mp])
  );

  const isMatchOpen = match.status === "open";

  // Build squad list with match status
  const squadRows = (squadMembers ?? []).map((m) => {
    const player = playersMap.get(m.player_id);
    const mp = matchPlayerByPlayerId.get(m.player_id);
    return {
      membershipId: m.id,
      player,
      matchPlayer: mp,
      status: mp ? mp.participation_status : "not_invited",
    };
  });

  const invitedCount = squadRows.filter((r) => r.matchPlayer && r.status !== "cancelled").length;
  const confirmedCount = squadRows.filter((r) => r.status === "confirmed").length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href="/coach"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-muted)] hover:text-[var(--mhl-green)]"
      >
        &larr; Volver a Mi Equipo
      </Link>

      {/* HEADER PARTIDO */}
      <div className="mt-6 rounded-3xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
              isHome ? "bg-blue-500/15 text-blue-400 border border-blue-500/30" : "bg-purple-500/15 text-purple-400 border border-purple-500/30"
            }`}>
              {isHome ? "Condición: Local" : "Condición: Visitante"}
            </span>
            <span className="rounded-md border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-2.5 py-1 text-[10px] font-bold uppercase text-[var(--mhl-muted)]">
              Estado: {match.status}
            </span>
          </div>

          <span className="text-xs font-bold text-[var(--mhl-muted)]">
            {match.scheduled_at
              ? new Date(match.scheduled_at).toLocaleDateString("es-AR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Fecha a confirmar"}
          </span>
        </div>

        <div className="mt-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--mhl-green)]">Convocatoria Oficial</p>
          <h1 className="mt-1 text-3xl font-black uppercase tracking-tight sm:text-4xl">
            {myTeam?.name} <span className="text-[var(--mhl-muted)]">vs</span> {rivalTeam?.name || "Rival"}
          </h1>
          <p className="mt-1 text-sm text-[var(--mhl-muted)]">
            {match.venue_name || "Lugar a designar"} {match.pitch ? `· Cancha ${match.pitch}` : ""}
            {match.matchday ? ` · Jornada ${match.matchday}` : ""}
          </p>
        </div>

        {/* ESTADO FINANCIERO DEL EQUIPO */}
        <div className="mt-6 grid grid-cols-3 gap-3 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-4 text-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Tarifa del Equipo</p>
            <p className="mt-1 text-lg font-black text-[var(--mhl-text)]">${amountDue.toLocaleString("es-AR")}</p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-green)]">Abonado</p>
            <p className="mt-1 text-lg font-black text-[var(--mhl-green)]">${totalPaid.toLocaleString("es-AR")}</p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-red)]">Saldo Pendiente</p>
            <p className="mt-1 text-lg font-black text-[var(--mhl-red)]">${balance.toLocaleString("es-AR")}</p>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-[var(--mhl-muted)] italic">
          * Nota: El Director Técnico no valida ni cobra pagos en V1. El cobro del equipo lo registra el Administrador o el Planillero asignado.
        </p>
      </div>

      {/* PLANTILLA Y CONVOCATORIAS */}
      <section className="mt-10 space-y-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-green)]">Citación al Partido</p>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Plantilla del Equipo</h2>
            <p className="mt-1 text-xs text-[var(--mhl-muted)]">
              Convocá a los jugadores activos de tu plantel. Al convocarlos recibirán la notificación para confirmar o rechazar su asistencia.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-3 py-2 text-right">
              <span className="text-[10px] font-black uppercase text-[var(--mhl-muted)]">Convocados: </span>
              <strong className="text-[var(--mhl-text)]">{invitedCount}</strong>
            </div>
            <div className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-3 py-2 text-right">
              <span className="text-[10px] font-black uppercase text-[var(--mhl-green)]">Confirmados: </span>
              <strong className="text-[var(--mhl-green)]">{confirmedCount}</strong>
            </div>
          </div>
        </div>

        {!isMatchOpen && (
          <div className="rounded-xl border border-[var(--mhl-yellow)]/40 bg-[var(--mhl-yellow)]/10 p-3 text-xs text-[var(--mhl-yellow)]">
            Este partido no se encuentra en estado <strong>abierto</strong> (estado actual: {match.status}). No es posible emitir nuevas convocatorias en esta instancia.
          </div>
        )}

        {squadRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-8 text-center text-sm text-[var(--mhl-muted)]">
            Tu equipo no cuenta con jugadores activos en la plantilla. Incorporá jugadores desde el panel principal de Mi Equipo.
          </div>
        ) : (
          <div className="space-y-3">
            {squadRows.map(({ player, matchPlayer, status }) => {
              if (!player) return null;

              const isNotInvited = status === "not_invited";
              const isReserved = status === "reserved";
              const isConfirmed = status === "confirmed";
              const isCancelled = status === "cancelled";
              const isPlayed = status === "played";
              const isNoShow = status === "no_show";

              return (
                <article
                  key={player.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-4 transition hover:border-[#3e4c44] sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--mhl-panel-2)] font-black text-[var(--mhl-green)]">
                      {player.jersey_number ? `#${player.jersey_number}` : "—"}
                    </span>
                    <div>
                      <h3 className="text-base font-black uppercase tracking-tight">
                        {player.display_name}
                      </h3>
                      <p className="text-xs text-[var(--mhl-muted)]">
                        {player.position ?? "Jugador"} {player.category ? `· ${player.category}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:self-center">
                    {/* ESTADOS CLAROS SEGÚN REQUERIMIENTO */}
                    {isNotInvited && (
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-1 text-xs font-bold uppercase text-[var(--mhl-muted)]">
                          No convocado
                        </span>
                        {isMatchOpen && (
                          <form action={invitePlayerToMatch}>
                            <input type="hidden" name="matchId" value={match.id} />
                            <input type="hidden" name="playerId" value={player.id} />
                            <button
                              type="submit"
                              className="rounded-xl bg-[var(--mhl-green)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                            >
                              Convocar
                            </button>
                          </form>
                        )}
                      </div>
                    )}

                    {isReserved && (
                      <span className="rounded-lg border border-[var(--mhl-yellow)]/40 bg-[var(--mhl-yellow)]/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-[var(--mhl-yellow)]">
                        Convocado (reserved)
                      </span>
                    )}

                    {isConfirmed && (
                      <span className="rounded-lg border border-[var(--mhl-green)]/40 bg-[var(--mhl-green)]/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-[var(--mhl-green)]">
                        Confirmado (confirmed)
                      </span>
                    )}

                    {isCancelled && (
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-[var(--mhl-red)]">
                          Rechazado/Cancelado (cancelled)
                        </span>
                        {isMatchOpen && (
                          <form action={invitePlayerToMatch}>
                            <input type="hidden" name="matchId" value={match.id} />
                            <input type="hidden" name="playerId" value={player.id} />
                            <button
                              type="submit"
                              className="rounded-xl border border-[var(--mhl-green)]/50 bg-[var(--mhl-green)]/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-[var(--mhl-green)] hover:bg-[var(--mhl-green)]/25"
                            >
                              Re-convocar
                            </button>
                          </form>
                        )}
                      </div>
                    )}

                    {isPlayed && (
                      <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-400">
                        Jugó (played)
                      </span>
                    )}

                    {isNoShow && (
                      <span className="rounded-lg border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-[var(--mhl-red)]">
                        Ausente (no_show)
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
