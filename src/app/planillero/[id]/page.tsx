import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  setAttendanceAction,
  recordPaymentAction,
  recordTeamPaymentAction,
  startMatchAction,
  completeMatchAction,
} from "../actions";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PlanilleroMatchPage({ params }: Props) {
  const { user } = await requireRole("planillero");
  const { id } = await params;
  const supabase = await createClient();

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("*")
    .eq("id", id)
    .single();

  if (matchError || !match) {
    notFound();
  }

  if (match.scorekeeper_user_id !== user.id) {
    redirect("/planillero");
  }

  const isCompetition = match.match_type === "competition";

  const { data: matchPlayers } = await supabase
    .from("match_players")
    .select("id, match_id, player_id, team_id, side, participation_status, attendance_status, minutes_played, updated_at")
    .eq("match_id", id);

  const currentMatchPlayers = matchPlayers ?? [];
  const playerIds = currentMatchPlayers.map((mp) => mp.player_id);
  const matchPlayerIds = currentMatchPlayers.map((mp) => mp.id);
  const teamIds = [match.home_team_id, match.away_team_id].filter(Boolean) as string[];

  const [playersResult, playerFinancialsResult, playerPaymentsResult, teamFinancialsResult, teamsResult] = await Promise.all([
    playerIds.length > 0
      ? supabase.from("players").select("id, display_name, jersey_number, position, category").in("id", playerIds)
      : Promise.resolve({ data: [] }),
    !isCompetition && matchPlayerIds.length > 0
      ? supabase.from("match_player_financials").select("match_player_id, amount_due").in("match_player_id", matchPlayerIds)
      : Promise.resolve({ data: [] }),
    !isCompetition && matchPlayerIds.length > 0
      ? supabase
          .from("match_payments")
          .select("id, match_player_id, kind, amount, method, note, paid_at, voided_at")
          .in("match_player_id", matchPlayerIds)
          .is("voided_at", null)
      : Promise.resolve({ data: [] }),
    isCompetition
      ? supabase
          .from("match_team_financials")
          .select("id, match_id, team_id, amount_due")
          .eq("match_id", id)
      : Promise.resolve({ data: [] }),
    isCompetition && teamIds.length > 0
      ? supabase.from("teams").select("id, name, short_name").in("id", teamIds)
      : Promise.resolve({ data: [] }),
  ]);

  const teamFinancials = teamFinancialsResult.data ?? [];
  const teamFinancialIds = teamFinancials.map((financial) => financial.id);
  const teamPaymentsResult = isCompetition && teamFinancialIds.length > 0
    ? await supabase
        .from("match_team_payments")
        .select("id, financial_id, kind, amount, method, note, paid_at, voided_at")
        .in("financial_id", teamFinancialIds)
        .is("voided_at", null)
        .order("paid_at", { ascending: false })
    : { data: [] };

  const playersMap = new Map((playersResult.data ?? []).map((player) => [player.id, player]));
  const teamNames = new Map((teamsResult.data ?? []).map((team) => [team.id, team.name]));

  const playerFinancialsMap = new Map(
    (playerFinancialsResult.data ?? []).map((financial) => [financial.match_player_id, financial.amount_due])
  );
  const playerPaymentsSumMap = new Map<string, number>();
  for (const payment of playerPaymentsResult.data ?? []) {
    playerPaymentsSumMap.set(
      payment.match_player_id,
      (playerPaymentsSumMap.get(payment.match_player_id) ?? 0) + payment.amount
    );
  }

  const teamPayments = teamPaymentsResult.data ?? [];
  const teamPaymentsByFinancialId = new Map<string, Array<(typeof teamPayments)[number]>>();
  for (const payment of teamPayments) {
    const list = teamPaymentsByFinancialId.get(payment.financial_id) ?? [];
    list.push(payment);
    teamPaymentsByFinancialId.set(payment.financial_id, list);
  }

  const getTeamStats = (teamId: string | null) => {
    const financial = teamFinancials.find((row) => row.team_id === teamId);
    const payments = financial ? teamPaymentsByFinancialId.get(financial.id) ?? [] : [];
    let paid = 0;
    let waiver = 0;
    for (const payment of payments) {
      if (payment.kind === "payment") paid += payment.amount;
      if (payment.kind === "waiver") waiver += payment.amount;
    }
    const due = financial?.amount_due ?? match.team_price ?? 0;
    return {
      financial,
      payments,
      due,
      paid,
      waiver,
      balance: Math.max(0, due - paid - waiver),
    };
  };

  const homeStats = getTeamStats(match.home_team_id);
  const awayStats = getTeamStats(match.away_team_id);
  const homeName = match.home_team_id ? teamNames.get(match.home_team_id) ?? "Local" : "Local";
  const awayName = match.away_team_id ? teamNames.get(match.away_team_id) ?? "Visitante" : "Visitante";

  let totalDue = 0;
  let totalCollected = 0;
  let totalWaivers = 0;

  const playerRows = currentMatchPlayers.map((mp) => {
    const player = playersMap.get(mp.player_id);
    const amountDue = !isCompetition ? playerFinancialsMap.get(mp.id) ?? match.player_price ?? 0 : 0;
    const totalPaid = !isCompetition ? playerPaymentsSumMap.get(mp.id) ?? 0 : 0;
    const balance = Math.max(0, amountDue - totalPaid);

    if (!isCompetition && mp.participation_status !== "cancelled") {
      totalDue += amountDue;
      totalCollected += totalPaid;
    }

    return { matchPlayer: mp, player, amountDue, totalPaid, balance };
  });

  if (isCompetition) {
    totalDue = homeStats.due + awayStats.due;
    totalCollected = homeStats.paid + awayStats.paid;
    totalWaivers = homeStats.waiver + awayStats.waiver;
  }

  const totalBalance = Math.max(0, totalDue - totalCollected - totalWaivers);
  const pendingConfirmedAttendance = currentMatchPlayers.filter(
    (mp) => mp.participation_status === "confirmed" && mp.attendance_status === "pending"
  ).length;

  const isInProgress = match.status === "in_progress";
  const isCompleted = match.status === "completed";
  const isCancelled = match.status === "cancelled";
  const canStart = ["open", "full", "confirmed"].includes(match.status);

  const TeamFinanceCard = ({
    teamName,
    stats,
    accent,
  }: {
    teamName: string;
    stats: ReturnType<typeof getTeamStats>;
    accent: "home" | "away";
  }) => {
    const canPayTeam = Boolean(stats.financial) && stats.balance > 0 && !isCompleted && !isCancelled;
    return (
      <article className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={`text-[10px] font-black uppercase tracking-wider ${accent === "home" ? "text-blue-400" : "text-purple-400"}`}>
              {accent === "home" ? "Equipo Local" : "Equipo Visitante"}
            </p>
            <h3 className="mt-1 text-lg font-black uppercase tracking-tight">{teamName}</h3>
          </div>
          <span className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase ${stats.balance > 0 ? "bg-[var(--mhl-red)]/15 text-[var(--mhl-red)]" : "bg-[var(--mhl-green)]/15 text-[var(--mhl-green)]"}`}>
            {stats.balance > 0 ? "Pendiente" : "Al día"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-[var(--mhl-panel-2)] p-2">
            <p className="text-[9px] font-black uppercase text-[var(--mhl-muted)]">Debe</p>
            <p className="mt-1 text-sm font-black">${stats.due.toLocaleString("es-AR")}</p>
          </div>
          <div className="rounded-xl bg-[var(--mhl-panel-2)] p-2">
            <p className="text-[9px] font-black uppercase text-[var(--mhl-muted)]">Abonó</p>
            <p className="mt-1 text-sm font-black text-[var(--mhl-green)]">${stats.paid.toLocaleString("es-AR")}</p>
          </div>
          <div className="rounded-xl bg-[var(--mhl-panel-2)] p-2">
            <p className="text-[9px] font-black uppercase text-[var(--mhl-muted)]">Saldo</p>
            <p className={`mt-1 text-sm font-black ${stats.balance > 0 ? "text-[var(--mhl-red)]" : "text-[var(--mhl-green)]"}`}>
              ${stats.balance.toLocaleString("es-AR")}
            </p>
          </div>
        </div>

        {stats.waiver > 0 && (
          <p className="mt-2 text-[10px] text-[var(--mhl-muted)]">
            Cortesías aplicadas por Admin: <strong className="text-[var(--mhl-yellow)]">${stats.waiver.toLocaleString("es-AR")}</strong>
          </p>
        )}

        {canPayTeam && stats.financial && (
          <form action={recordTeamPaymentAction} className="mt-4 rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-3">
            <input type="hidden" name="matchId" value={match.id} />
            <input type="hidden" name="financialId" value={stats.financial.id} />
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-yellow)]">Registrar pago del equipo</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                type="number"
                name="amount"
                defaultValue={stats.balance}
                max={stats.balance}
                min={1}
                step="any"
                required
                className="rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1.5 text-xs font-bold text-[var(--mhl-text)]"
              />
              <select
                name="method"
                defaultValue="cash"
                required
                className="rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1.5 text-xs text-[var(--mhl-text)]"
              >
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="mercadopago">Mercado Pago</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <input
              type="text"
              name="note"
              placeholder="Nota opcional, ej. entrega del Coach"
              className="mt-2 w-full rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1.5 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)]"
            />
            <button type="submit" className="mt-2 w-full rounded-lg bg-[var(--mhl-yellow)] py-2 text-xs font-black uppercase tracking-wider text-[#080b0a]">
              Confirmar pago
            </button>
          </form>
        )}

        {stats.payments.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-[var(--mhl-border)] pt-3">
            <p className="text-[9px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Movimientos vigentes</p>
            {stats.payments.slice(0, 4).map((payment) => (
              <div key={payment.id} className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--mhl-muted)]">
                  {payment.kind === "waiver" ? "Cortesía" : payment.method || "Pago"}
                  {payment.note ? ` · ${payment.note}` : ""}
                </span>
                <strong className={payment.kind === "waiver" ? "text-[var(--mhl-yellow)]" : "text-[var(--mhl-green)]"}>
                  ${payment.amount.toLocaleString("es-AR")}
                </strong>
              </div>
            ))}
          </div>
        )}
      </article>
    );
  };

  return (
    <main className="mx-auto max-w-3xl px-3 py-6 pb-24 sm:px-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/planillero" className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[var(--mhl-muted)] hover:text-[var(--mhl-yellow)]">
          ← Mis partidos
        </Link>
        <span className="rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2.5 py-1 text-[10px] font-black uppercase text-[var(--mhl-yellow)]">
          Planilla Oficial
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--mhl-muted)]">
            {match.scheduled_at
              ? new Date(match.scheduled_at).toLocaleDateString("es-AR", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Fecha a confirmar"}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
            isInProgress
              ? "border border-purple-500/40 bg-purple-500/20 text-purple-400"
              : isCompleted
                ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-400"
                : "bg-neutral-800 text-[var(--mhl-text)]"
          }`}>
            {match.status}
          </span>
        </div>

        <h1 className="mt-2 text-2xl font-black uppercase tracking-tight">
          {isCompetition ? `${homeName} vs ${awayName}` : `${match.venue_name || "Predio sin nombre"}${match.pitch ? ` · Cancha ${match.pitch}` : ""}`}
        </h1>
        {isCompetition && (
          <p className="mt-1 text-xs text-[var(--mhl-muted)]">{match.venue_name || "Lugar a designar"} {match.pitch ? `· Cancha ${match.pitch}` : ""}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <div className="rounded-xl bg-[var(--mhl-panel-2)] px-3 py-1.5">
            <span className="text-[10px] uppercase text-[var(--mhl-muted)]">{isCompetition ? "Convocados" : "Inscriptos"}: </span>
            <strong className="text-[var(--mhl-green)]">{playerRows.filter((row) => row.matchPlayer.participation_status !== "cancelled").length}</strong>
          </div>
          <div className="rounded-xl bg-[var(--mhl-panel-2)] px-3 py-1.5">
            <span className="text-[10px] uppercase text-[var(--mhl-muted)]">Recaudado: </span>
            <strong className="text-[var(--mhl-green)]">${totalCollected.toLocaleString("es-AR")}</strong>
          </div>
          <div className="rounded-xl bg-[var(--mhl-panel-2)] px-3 py-1.5">
            <span className="text-[10px] uppercase text-[var(--mhl-muted)]">Pendiente: </span>
            <strong className="text-[var(--mhl-red)]">${totalBalance.toLocaleString("es-AR")}</strong>
          </div>
        </div>
      </div>

      {isCompetition && (
        <section className="mt-6 space-y-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--mhl-yellow)]">Caja del partido</p>
            <h2 className="mt-1 text-xl font-black uppercase tracking-tight">Cobro por Equipo</h2>
            <p className="mt-1 text-xs text-[var(--mhl-muted)]">En competencia no se cobra individualmente a cada jugador.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TeamFinanceCard teamName={homeName} stats={homeStats} accent="home" />
            <TeamFinanceCard teamName={awayName} stats={awayStats} accent="away" />
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mhl-muted)]">Control de Partido</p>

        {canStart && (
          <div className="mt-3 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <div>
              <h2 className="text-base font-black uppercase tracking-tight">Partido listo para iniciar</h2>
              <p className="text-xs text-[var(--mhl-muted)]">Presioná Iniciar cuando los equipos entren a la cancha.</p>
            </div>
            <form action={startMatchAction} className="w-full sm:w-auto">
              <input type="hidden" name="matchId" value={match.id} />
              <button type="submit" className="w-full rounded-xl bg-[var(--mhl-green)] px-6 py-3 text-xs font-black uppercase tracking-wider text-[#080b0a] shadow-lg sm:w-auto">
                ▶ Iniciar Partido
              </button>
            </form>
          </div>
        )}

        {isInProgress && (
          <div className="mt-3 space-y-4">
            <div className="flex items-center gap-2 text-purple-400">
              <span className="inline-block h-3 w-3 animate-ping rounded-full bg-purple-500" />
              <h2 className="text-base font-black uppercase tracking-tight">Partido en curso</h2>
            </div>

            {pendingConfirmedAttendance > 0 && (
              <div className="rounded-xl border border-[var(--mhl-yellow)]/40 bg-[var(--mhl-yellow)]/10 p-3 text-xs text-[var(--mhl-yellow)]">
                <strong>Atención:</strong> Hay {pendingConfirmedAttendance} jugador{pendingConfirmedAttendance > 1 ? "es" : ""} confirmado{pendingConfirmedAttendance > 1 ? "s" : ""} con asistencia pendiente.
              </div>
            )}

            <form action={completeMatchAction} className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-4">
              <p className="text-xs font-black uppercase tracking-wider text-[var(--mhl-text)]">Finalizar Partido</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">{isCompetition ? homeName : "Goles Local / Equipo 1"}</label>
                  <input type="number" name="homeScore" min="0" defaultValue={0} required className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-3 py-2 text-center text-lg font-black text-[var(--mhl-text)]" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">{isCompetition ? awayName : "Goles Visitante / Equipo 2"}</label>
                  <input type="number" name="awayScore" min="0" defaultValue={0} required className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-3 py-2 text-center text-lg font-black text-[var(--mhl-text)]" />
                </div>
              </div>
              <input type="hidden" name="matchId" value={match.id} />
              <button
                type="submit"
                disabled={pendingConfirmedAttendance > 0}
                className={`mt-4 w-full rounded-xl py-3 text-xs font-black uppercase tracking-wider ${pendingConfirmedAttendance > 0 ? "cursor-not-allowed bg-neutral-800 text-neutral-500" : "bg-purple-500 text-white"}`}
              >
                Finalizar y Cerrar Partido
              </button>
            </form>
          </div>
        )}

        {isCompleted && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--mhl-panel-2)] p-4">
            <div>
              <p className="text-[10px] font-black uppercase text-emerald-400">Partido Cerrado</p>
              <h2 className="text-xl font-black uppercase tracking-tight">Resultado Oficial</h2>
            </div>
            <div className="text-2xl font-black text-emerald-400">{match.home_score} : {match.away_score}</div>
          </div>
        )}

        {isCancelled && <p className="mt-2 text-xs font-bold uppercase text-[var(--mhl-red)]">Este partido fue cancelado.</p>}
      </section>

      <section className="mt-8 space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--mhl-yellow)]">Mesa de Asistencia</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">{isCompetition ? "Jugadores Convocados" : "Jugadores Inscriptos"}</h2>
          <p className="mt-1 text-xs text-[var(--mhl-muted)]">
            {isCompetition ? "Marcá asistencia de los jugadores confirmados. El cobro se gestiona por equipo arriba." : "Marcá asistencia y registrá los cobros individuales."}
          </p>
        </div>

        {playerRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-8 text-center text-xs text-[var(--mhl-muted)]">
            {isCompetition ? "Todavía no hay jugadores convocados a este partido." : "No hay jugadores inscriptos todavía a este partido."}
          </div>
        ) : (
          <div className="space-y-3">
            {playerRows.map(({ matchPlayer, player, amountDue, totalPaid, balance }) => {
              const isConfirmed = matchPlayer.participation_status === "confirmed";
              const isReserved = matchPlayer.participation_status === "reserved";
              const isPresent = matchPlayer.attendance_status === "present";
              const isAbsent = matchPlayer.attendance_status === "absent";
              const canMarkAttendance = isConfirmed && !isCompleted && !isCancelled;
              const canPayPlayer = !isCompetition && balance > 0 && !isCompleted && !isCancelled;
              const rowTeamName = matchPlayer.team_id ? teamNames.get(matchPlayer.team_id) : null;

              return (
                <article
                  key={matchPlayer.id}
                  className={`rounded-2xl border p-4 ${
                    isPresent
                      ? "border-[var(--mhl-green)]/30 bg-[var(--mhl-panel)]"
                      : isAbsent
                        ? "border-[var(--mhl-red)]/30 bg-[var(--mhl-panel)]"
                        : "border-[var(--mhl-border)] bg-[var(--mhl-panel)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-[var(--mhl-panel-2)] px-2 py-0.5 text-xs font-black text-[var(--mhl-green)]">{player?.jersey_number ? `#${player.jersey_number}` : "—"}</span>
                      <div>
                        <h3 className="text-base font-black uppercase tracking-tight">{player?.display_name ?? "Jugador"}</h3>
                        {isCompetition && rowTeamName && <p className="text-[10px] font-bold uppercase text-[var(--mhl-muted)]">{rowTeamName}</p>}
                      </div>
                    </div>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      isConfirmed
                        ? "bg-[var(--mhl-green)]/15 text-[var(--mhl-green)]"
                        : isReserved
                          ? "bg-[var(--mhl-yellow)]/15 text-[var(--mhl-yellow)]"
                          : "bg-neutral-800 text-[var(--mhl-muted)]"
                    }`}>
                      {matchPlayer.participation_status}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--mhl-border)]/60 pt-3">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">
                      Asistencia: <strong className={isPresent ? "text-[var(--mhl-green)]" : isAbsent ? "text-[var(--mhl-red)]" : "text-[var(--mhl-yellow)]"}>{matchPlayer.attendance_status}</strong>
                    </span>

                    {canMarkAttendance ? (
                      <div className="flex items-center gap-1.5">
                        <form action={setAttendanceAction}>
                          <input type="hidden" name="matchId" value={match.id} />
                          <input type="hidden" name="matchPlayerId" value={matchPlayer.id} />
                          <input type="hidden" name="attendanceStatus" value="present" />
                          <button type="submit" className={`rounded-xl px-3 py-1.5 text-xs font-black uppercase tracking-wider ${isPresent ? "bg-[var(--mhl-green)] text-[#080b0a]" : "border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] text-[var(--mhl-muted)]"}`}>Presente</button>
                        </form>
                        <form action={setAttendanceAction}>
                          <input type="hidden" name="matchId" value={match.id} />
                          <input type="hidden" name="matchPlayerId" value={matchPlayer.id} />
                          <input type="hidden" name="attendanceStatus" value="absent" />
                          <button type="submit" className={`rounded-xl px-3 py-1.5 text-xs font-black uppercase tracking-wider ${isAbsent ? "bg-[var(--mhl-red)] text-white" : "border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] text-[var(--mhl-muted)]"}`}>Ausente</button>
                        </form>
                      </div>
                    ) : isReserved ? (
                      <span className="text-[10px] italic text-[var(--mhl-muted)]">Pendiente de confirmación</span>
                    ) : null}
                  </div>

                  {!isCompetition && (
                    <>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--mhl-panel-2)] p-2.5 text-xs">
                        <div className="flex flex-wrap gap-3">
                          <span className="text-[var(--mhl-muted)]">Debido: <strong className="text-[var(--mhl-text)]">${amountDue.toLocaleString("es-AR")}</strong></span>
                          <span className="text-[var(--mhl-muted)]">Abonado: <strong className="text-[var(--mhl-green)]">${totalPaid.toLocaleString("es-AR")}</strong></span>
                        </div>
                        <div>
                          <span className="text-[var(--mhl-muted)]">Saldo: </span>
                          <strong className={`font-black ${balance > 0 ? "text-[var(--mhl-red)]" : "text-[var(--mhl-green)]"}`}>{balance > 0 ? `$${balance.toLocaleString("es-AR")} (Debe)` : "Al día"}</strong>
                        </div>
                      </div>

                      {canPayPlayer && (
                        <form action={recordPaymentAction} className="mt-3 rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-3">
                          <input type="hidden" name="matchId" value={match.id} />
                          <input type="hidden" name="matchPlayerId" value={matchPlayer.id} />
                          <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-yellow)]">Registrar Cobro Manual V1</p>
                          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            <input type="number" name="amount" defaultValue={balance} max={balance} min={1} step="any" required className="rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1.5 text-xs font-bold text-[var(--mhl-text)]" />
                            <select name="method" defaultValue="cash" required className="rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1.5 text-xs text-[var(--mhl-text)]">
                              <option value="cash">Efectivo</option>
                              <option value="transfer">Transferencia</option>
                              <option value="mercadopago">Mercado Pago</option>
                              <option value="other">Otro</option>
                            </select>
                            <input type="text" name="note" placeholder="Nota opcional" className="col-span-2 rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1.5 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] sm:col-span-1" />
                          </div>
                          <button type="submit" className="mt-2.5 w-full rounded-lg bg-[var(--mhl-yellow)] py-2 text-xs font-black uppercase tracking-wider text-[#080b0a]">Confirmar Cobro</button>
                        </form>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
