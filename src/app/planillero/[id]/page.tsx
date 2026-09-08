import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  setAttendanceAction,
  recordPaymentAction,
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

  // 1. Fetch match and verify scorekeeper assignment
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("*")
    .eq("id", id)
    .single();

  if (matchError || !match) {
    notFound();
  }

  // Ensure this scorekeeper is assigned to the match
  if (match.scorekeeper_user_id !== user.id) {
    redirect("/planillero");
  }

  // 2. Fetch match players
  const { data: matchPlayers } = await supabase
    .from("match_players")
    .select("id, match_id, player_id, participation_status, attendance_status, minutes_played, updated_at")
    .eq("match_id", id);

  const currentMatchPlayers = matchPlayers ?? [];
  const playerIds = currentMatchPlayers.map((mp) => mp.player_id);
  const matchPlayerIds = currentMatchPlayers.map((mp) => mp.id);

  // 3. Fetch players, financials, and payments in parallel
  const [
    { data: playersData },
    { data: financialsData },
    { data: paymentsData },
  ] = await Promise.all([
    playerIds.length > 0
      ? supabase.from("players").select("id, display_name, jersey_number, position, category").in("id", playerIds)
      : { data: [] },
    matchPlayerIds.length > 0
      ? supabase.from("match_player_financials").select("match_player_id, amount_due").in("match_player_id", matchPlayerIds)
      : { data: [] },
    matchPlayerIds.length > 0
      ? supabase
          .from("match_payments")
          .select("id, match_player_id, kind, amount, method, note, paid_at, voided_at")
          .in("match_player_id", matchPlayerIds)
          .is("voided_at", null)
      : { data: [] },
  ]);

  const playersMap = new Map((playersData ?? []).map((p) => [p.id, p]));
  const financialsMap = new Map((financialsData ?? []).map((f) => [f.match_player_id, f.amount_due]));

  // Sum payments per player
  const paymentsSumMap = new Map<string, number>();
  for (const pay of paymentsData ?? []) {
    paymentsSumMap.set(pay.match_player_id, (paymentsSumMap.get(pay.match_player_id) ?? 0) + pay.amount);
  }

  // Calculate totals
  let totalDue = 0;
  let totalCollected = 0;

  const playerRows = currentMatchPlayers.map((mp) => {
    const p = playersMap.get(mp.player_id);
    const amountDue = financialsMap.get(mp.id) ?? match.player_price ?? 0;
    const totalPaid = paymentsSumMap.get(mp.id) ?? 0;
    const balance = Math.max(0, amountDue - totalPaid);

    if (mp.participation_status !== "cancelled") {
      totalDue += amountDue;
      totalCollected += totalPaid;
    }

    return {
      matchPlayer: mp,
      player: p,
      amountDue,
      totalPaid,
      balance,
    };
  });

  const totalBalance = Math.max(0, totalDue - totalCollected);

  // Check pending attendance for confirmed players (required to complete match)
  const pendingConfirmedAttendance = currentMatchPlayers.filter(
    (mp) => mp.participation_status === "confirmed" && mp.attendance_status === "pending"
  ).length;

  const isInProgress = match.status === "in_progress";
  const isCompleted = match.status === "completed";
  const isCancelled = match.status === "cancelled";
  const canStart = ["open", "full", "confirmed"].includes(match.status);

  return (
    <main className="mx-auto max-w-3xl px-3 py-6 pb-24 sm:px-4">
      {/* HEADER SIMPLE MOBILE-FIRST */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/planillero"
          className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[var(--mhl-muted)] hover:text-[var(--mhl-yellow)]"
        >
          &larr; Mis partidos
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
              ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
              : isCompleted
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
              : "bg-neutral-800 text-[var(--mhl-text)]"
          }`}>
            {match.status}
          </span>
        </div>

        <h1 className="mt-2 text-2xl font-black uppercase tracking-tight">
          {match.venue_name || "Predio sin nombre"} {match.pitch ? `· Cancha ${match.pitch}` : ""}
        </h1>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <div className="rounded-xl bg-[var(--mhl-panel-2)] px-3 py-1.5">
            <span className="text-[10px] uppercase text-[var(--mhl-muted)]">Inscriptos: </span>
            <strong className="text-[var(--mhl-green)]">{playerRows.length}</strong>
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

      {/* PANEL DE CONTROL DEL PARTIDO (INICIAR / FINALIZAR) */}
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
              <button
                type="submit"
                className="w-full rounded-xl bg-[var(--mhl-green)] px-6 py-3 text-xs font-black uppercase tracking-wider text-[#080b0a] shadow-lg transition hover:brightness-110 sm:w-auto"
              >
                &#9654; Iniciar Partido
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
                Debés marcar a cada uno como Presente o Ausente abajo antes de finalizar el partido.
              </div>
            )}

            <form action={completeMatchAction} className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-4">
              <p className="text-xs font-black uppercase tracking-wider text-[var(--mhl-text)]">Finalizar Partido</p>
              <p className="mt-0.5 text-[11px] text-[var(--mhl-muted)]">Ingresá el resultado final de goles para cerrar la planilla.</p>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Goles Local / Equipo 1</label>
                  <input
                    type="number"
                    name="homeScore"
                    min="0"
                    defaultValue={0}
                    required
                    className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-3 py-2 text-center text-lg font-black text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Goles Visitante / Equipo 2</label>
                  <input
                    type="number"
                    name="awayScore"
                    min="0"
                    defaultValue={0}
                    required
                    className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-3 py-2 text-center text-lg font-black text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none"
                  />
                </div>
              </div>

              <input type="hidden" name="matchId" value={match.id} />
              <button
                type="submit"
                disabled={pendingConfirmedAttendance > 0}
                className={`mt-4 w-full rounded-xl py-3 text-xs font-black uppercase tracking-wider transition ${
                  pendingConfirmedAttendance > 0
                    ? "cursor-not-allowed bg-neutral-800 text-neutral-500"
                    : "bg-purple-500 text-white shadow-lg hover:bg-purple-600"
                }`}
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
            <div className="text-2xl font-black text-emerald-400">
              {match.home_score} : {match.away_score}
            </div>
          </div>
        )}

        {isCancelled && (
          <p className="mt-2 text-xs font-bold uppercase text-[var(--mhl-red)]">Este partido fue cancelado.</p>
        )}
      </section>

      {/* PLANILLA DE JUGADORES */}
      <section className="mt-8 space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--mhl-yellow)]">Mesa de Asistencia y Cobros</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Jugadores Inscriptos</h2>
          <p className="mt-1 text-xs text-[var(--mhl-muted)]">
            Marcá asistencia y registrá los cobros manuales antes o durante el partido.
          </p>
        </div>

        {playerRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-8 text-center text-xs text-[var(--mhl-muted)]">
            No hay jugadores inscriptos todavía a este partido.
          </div>
        ) : (
          <div className="space-y-3">
            {playerRows.map(({ matchPlayer, player, amountDue, totalPaid, balance }) => {
              const isConfirmed = matchPlayer.participation_status === "confirmed";
              const isReserved = matchPlayer.participation_status === "reserved";
              const isPresent = matchPlayer.attendance_status === "present";
              const isAbsent = matchPlayer.attendance_status === "absent";
              const canMarkAttendance = isConfirmed && !isCompleted && !isCancelled;
              const canPay = balance > 0 && !isCompleted && !isCancelled;

              return (
                <article
                  key={matchPlayer.id}
                  className={`rounded-2xl border p-4 transition ${
                    isPresent
                      ? "border-[var(--mhl-green)]/30 bg-[var(--mhl-panel)]"
                      : isAbsent
                      ? "border-[var(--mhl-red)]/30 bg-[var(--mhl-panel)]"
                      : "border-[var(--mhl-border)] bg-[var(--mhl-panel)]"
                  }`}
                >
                  {/* CABECERA JUGADOR */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-[var(--mhl-panel-2)] px-2 py-0.5 text-xs font-black text-[var(--mhl-green)]">
                        {player?.jersey_number ? `#${player.jersey_number}` : "—"}
                      </span>
                      <h3 className="text-base font-black uppercase tracking-tight">
                        {player?.display_name ?? "Jugador"}
                      </h3>
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

                  {/* ASISTENCIA BUTTONS */}
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--mhl-border)]/60 pt-3">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">
                      Asistencia: <strong className={isPresent ? "text-[var(--mhl-green)]" : isAbsent ? "text-[var(--mhl-red)]" : "text-[var(--mhl-yellow)]"}>
                        {matchPlayer.attendance_status}
                      </strong>
                    </span>

                    {canMarkAttendance ? (
                      <div className="flex items-center gap-1.5">
                        <form action={setAttendanceAction}>
                          <input type="hidden" name="matchId" value={match.id} />
                          <input type="hidden" name="matchPlayerId" value={matchPlayer.id} />
                          <input type="hidden" name="attendanceStatus" value="present" />
                          <button
                            type="submit"
                            className={`rounded-xl px-3 py-1.5 text-xs font-black uppercase tracking-wider transition ${
                              isPresent
                                ? "bg-[var(--mhl-green)] text-[#080b0a]"
                                : "border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] text-[var(--mhl-muted)] hover:text-[var(--mhl-green)]"
                            }`}
                          >
                            Presente
                          </button>
                        </form>

                        <form action={setAttendanceAction}>
                          <input type="hidden" name="matchId" value={match.id} />
                          <input type="hidden" name="matchPlayerId" value={matchPlayer.id} />
                          <input type="hidden" name="attendanceStatus" value="absent" />
                          <button
                            type="submit"
                            className={`rounded-xl px-3 py-1.5 text-xs font-black uppercase tracking-wider transition ${
                              isAbsent
                                ? "bg-[var(--mhl-red)] text-white"
                                : "border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] text-[var(--mhl-muted)] hover:text-[var(--mhl-red)]"
                            }`}
                          >
                            Ausente
                          </button>
                        </form>
                      </div>
                    ) : isReserved ? (
                      <span className="text-[10px] italic text-[var(--mhl-muted)]">
                        Pendiente de confirmación del jugador
                      </span>
                    ) : null}
                  </div>

                  {/* ESTADO FINANCIERO */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--mhl-panel-2)] p-2.5 text-xs">
                    <div className="flex flex-wrap gap-3">
                      <span className="text-[var(--mhl-muted)]">
                        Debido: <strong className="text-[var(--mhl-text)]">${amountDue.toLocaleString("es-AR")}</strong>
                      </span>
                      <span className="text-[var(--mhl-muted)]">
                        Abonado: <strong className="text-[var(--mhl-green)]">${totalPaid.toLocaleString("es-AR")}</strong>
                      </span>
                    </div>

                    <div>
                      <span className="text-[var(--mhl-muted)]">Saldo: </span>
                      <strong className={`font-black ${balance > 0 ? "text-[var(--mhl-red)]" : "text-[var(--mhl-green)]"}`}>
                        {balance > 0 ? `$${balance.toLocaleString("es-AR")} (Debe)` : "Al día"}
                      </strong>
                    </div>
                  </div>

                  {/* FORMULARIO REGISTRAR COBRO */}
                  {canPay && (
                    <form action={recordPaymentAction} className="mt-3 rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-3">
                      <input type="hidden" name="matchId" value={match.id} />
                      <input type="hidden" name="matchPlayerId" value={matchPlayer.id} />

                      <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-yellow)]">
                        Registrar Cobro Manual V1
                      </p>

                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <div>
                          <label className="text-[9px] font-bold uppercase text-[var(--mhl-muted)]">Monto ($)</label>
                          <input
                            type="number"
                            name="amount"
                            defaultValue={balance}
                            max={balance}
                            min={1}
                            step="any"
                            required
                            className="mt-0.5 w-full rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1.5 text-xs font-bold text-[var(--mhl-text)] focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-bold uppercase text-[var(--mhl-muted)]">Medio</label>
                          <select
                            name="method"
                            defaultValue="cash"
                            className="mt-0.5 w-full rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1.5 text-xs text-[var(--mhl-text)] focus:outline-none"
                            required
                          >
                            <option value="cash">Efectivo</option>
                            <option value="transfer">Transferencia</option>
                            <option value="mercadopago">Mercado Pago</option>
                            <option value="other">Otro</option>
                          </select>
                        </div>

                        <div className="col-span-2 sm:col-span-1">
                          <label className="text-[9px] font-bold uppercase text-[var(--mhl-muted)]">Nota (opcional)</label>
                          <input
                            type="text"
                            name="note"
                            placeholder="Ej. Pagó mitad"
                            className="mt-0.5 w-full rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1.5 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:outline-none"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="mt-2.5 w-full rounded-lg bg-[var(--mhl-yellow)] py-2 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                      >
                        Confirmar Cobro
                      </button>
                    </form>
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
