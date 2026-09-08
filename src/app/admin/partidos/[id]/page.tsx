import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  publishMatch,
  assignScorekeeper,
  removeScorekeeper,
  grantMatchWaiverAction,
  voidMatchPaymentAction,
} from "../../actions";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminMatchDetailPage({ params }: Props) {
  await requireRole("admin");
  const { id } = await params;
  const supabase = await createClient();

  // 1. Fetch match data
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("*")
    .eq("id", id)
    .single();

  if (matchError || !match) {
    notFound();
  }

  // 2. Fetch related data in parallel
  const [
    { data: profiles },
    { data: matchPlayers },
  ] = await Promise.all([
    supabase.from("profiles").select("id, display_name").order("display_name"),
    supabase
      .from("match_players")
      .select("id, match_id, player_id, participation_status, attendance_status, minutes_played, updated_at")
      .eq("match_id", id),
  ]);

  const profilesMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name || p.id]));
  const currentMatchPlayers = matchPlayers ?? [];
  const playerIds = currentMatchPlayers.map((mp) => mp.player_id);
  const matchPlayerIds = currentMatchPlayers.map((mp) => mp.id);

  // 3. Fetch players and financials in parallel if there are enrolled players
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
          .select("id, match_player_id, kind, amount, method, note, registered_by, paid_at, voided_at, voided_by, void_reason")
          .in("match_player_id", matchPlayerIds)
          .order("paid_at", { ascending: false })
      : { data: [] },
  ]);

  const playersMap = new Map((playersData ?? []).map((p) => [p.id, p]));
  const financialsMap = new Map((financialsData ?? []).map((f) => [f.match_player_id, f.amount_due]));
  const allPayments = paymentsData ?? [];

  // Group payments and waivers by match_player_id
  const playerPaymentsMap = new Map<string, typeof allPayments>();
  for (const pay of allPayments) {
    const list = playerPaymentsMap.get(pay.match_player_id) ?? [];
    list.push(pay);
    playerPaymentsMap.set(pay.match_player_id, list);
  }

  // Calculate totals for match
  let totalMatchDue = 0;
  let totalMatchCollected = 0;
  let totalMatchWaivers = 0;

  const playerRows = currentMatchPlayers.map((mp) => {
    const p = playersMap.get(mp.player_id);
    const amountDue = financialsMap.get(mp.id) ?? match.player_price ?? 0;
    const payments = playerPaymentsMap.get(mp.id) ?? [];

    let totalPaid = 0;
    let totalWaiver = 0;

    for (const pmt of payments) {
      if (!pmt.voided_at) {
        if (pmt.kind === "payment") totalPaid += pmt.amount;
        if (pmt.kind === "waiver") totalWaiver += pmt.amount;
      }
    }

    const totalCredited = totalPaid + totalWaiver;
    const balance = Math.max(0, amountDue - totalCredited);

    if (mp.participation_status !== "cancelled") {
      totalMatchDue += amountDue;
      totalMatchCollected += totalPaid;
      totalMatchWaivers += totalWaiver;
    }

    return {
      matchPlayer: mp,
      player: p,
      amountDue,
      totalPaid,
      totalWaiver,
      totalCredited,
      balance,
    };
  });

  const totalMatchBalance = Math.max(0, totalMatchDue - totalMatchCollected - totalMatchWaivers);
  const activeEnrolledCount = currentMatchPlayers.filter((mp) => mp.participation_status !== "cancelled").length;
  const scorekeeperName = match.scorekeeper_user_id ? profilesMap.get(match.scorekeeper_user_id) ?? match.scorekeeper_user_id : null;

  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: "bg-neutral-800 text-neutral-300 border-neutral-700", text: "text-neutral-300", label: "Borrador (Draft)" },
    open: { bg: "bg-[var(--mhl-green)]/15 text-[var(--mhl-green)] border-[var(--mhl-green)]/30", text: "text-[var(--mhl-green)]", label: "Inscripción Abierta" },
    full: { bg: "bg-[var(--mhl-yellow)]/15 text-[var(--mhl-yellow)] border-[var(--mhl-yellow)]/30", text: "text-[var(--mhl-yellow)]", label: "Cupo Lleno" },
    confirmed: { bg: "bg-blue-500/15 text-blue-400 border-blue-500/30", text: "text-blue-400", label: "Confirmado" },
    in_progress: { bg: "bg-purple-500/15 text-purple-400 border-purple-500/30", text: "text-purple-400", label: "En Juego" },
    completed: { bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", text: "text-emerald-400", label: "Finalizado" },
    cancelled: { bg: "bg-[var(--mhl-red)]/15 text-[var(--mhl-red)] border-[var(--mhl-red)]/30", text: "text-[var(--mhl-red)]", label: "Cancelado" },
  };

  const currentStatusStyle = statusColors[match.status] || { bg: "bg-neutral-800 text-neutral-300 border-neutral-700", text: "text-neutral-300", label: match.status };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-muted)] hover:text-[var(--mhl-green)]"
      >
        &larr; Volver al Panel Admin
      </Link>

      {/* HEADER PARTIDO */}
      <div className="mt-6 flex flex-col justify-between gap-6 rounded-3xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6 md:flex-row md:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-lg border px-3 py-1 text-xs font-black uppercase tracking-wider ${currentStatusStyle.bg}`}>
              {currentStatusStyle.label}
            </span>
            <span className="rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">
              Tipo: {match.match_type}
            </span>
          </div>

          <h1 className="mt-3 text-3xl font-black uppercase tracking-tight sm:text-4xl">
            {match.venue_name || "Predio a definir"} {match.pitch ? `· Cancha ${match.pitch}` : ""}
          </h1>

          <p className="mt-1 text-sm font-bold text-[var(--mhl-muted)]">
            {match.scheduled_at ? new Date(match.scheduled_at).toLocaleDateString("es-AR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }) : "Fecha sin programar"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {match.status === "draft" && (
            <form action={publishMatch}>
              <input type="hidden" name="matchId" value={match.id} />
              <button
                type="submit"
                className="rounded-xl bg-[var(--mhl-green)] px-6 py-3 text-xs font-black uppercase tracking-wider text-[#080b0a] shadow-lg transition hover:brightness-110"
              >
                Publicar Amistoso
              </button>
            </form>
          )}

          <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-4 py-2.5 text-right">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Cupo / Inscriptos</p>
            <p className="text-xl font-black text-[var(--mhl-green)]">
              {activeEnrolledCount} / {match.max_players ?? "∞"}
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-4 py-2.5 text-right">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Precio / jugador</p>
            <p className="text-xl font-black text-[var(--mhl-text)]">
              ${match.player_price?.toLocaleString("es-AR") ?? "0"}
            </p>
          </div>
        </div>
      </div>

      {/* PLANILLERO ASIGNADO */}
      <section className="mt-6 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mhl-yellow)]">Staff del Partido</p>
            <h2 className="text-lg font-black uppercase tracking-tight">Planillero Oficial</h2>
            <p className="mt-0.5 text-xs text-[var(--mhl-muted)]">
              {scorekeeperName ? (
                <>Planillero activo: <span className="font-bold text-[var(--mhl-text)]">{scorekeeperName}</span></>
              ) : (
                "No hay ningún planillero asignado a este partido."
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {match.scorekeeper_user_id ? (
              <form action={removeScorekeeper}>
                <input type="hidden" name="matchId" value={match.id} />
                <button
                  type="submit"
                  className="rounded-xl border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-red)] transition hover:bg-[var(--mhl-red)]/20"
                >
                  Quitar planillero
                </button>
              </form>
            ) : null}

            <form action={assignScorekeeper} className="flex items-center gap-2">
              <input type="hidden" name="matchId" value={match.id} />
              <select
                name="userId"
                defaultValue={match.scorekeeper_user_id || ""}
                className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none"
                required
              >
                <option value="" disabled>Seleccionar usuario...</option>
                {(profiles ?? []).map((prof) => (
                  <option key={prof.id} value={prof.id}>
                    {prof.display_name || prof.id}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-xl bg-[var(--mhl-yellow)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
              >
                {match.scorekeeper_user_id ? "Cambiar" : "Asignar"}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* MÉTRICAS FINANCIERAS */}
      <section className="mt-8 grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--mhl-muted)]">Total Debido</p>
          <p className="mt-2 text-2xl font-black text-[var(--mhl-text)]">${totalMatchDue.toLocaleString("es-AR")}</p>
        </div>
        <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--mhl-green)]">Total Recaudado</p>
          <p className="mt-2 text-2xl font-black text-[var(--mhl-green)]">${totalMatchCollected.toLocaleString("es-AR")}</p>
        </div>
        <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--mhl-yellow)]">Cortesías / Waivers</p>
          <p className="mt-2 text-2xl font-black text-[var(--mhl-yellow)]">${totalMatchWaivers.toLocaleString("es-AR")}</p>
        </div>
        <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--mhl-red)]">Saldo Pendiente</p>
          <p className="mt-2 text-2xl font-black text-[var(--mhl-red)]">${totalMatchBalance.toLocaleString("es-AR")}</p>
        </div>
      </section>

      {/* JUGADORES Y FINANZAS */}
      <section className="mt-10 space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-green)]">Motor Financiero</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Jugadores & Saldos</h2>
          <p className="mt-1 text-xs text-[var(--mhl-muted)]">
            Supervisión individual de participación, asistencia, importe debido, pagos y cortesías.
          </p>
        </div>

        {playerRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] p-8 text-center text-sm text-[var(--mhl-muted)]">
            Aún no hay jugadores inscriptos a este partido.
          </div>
        ) : (
          <div className="space-y-3">
            {playerRows.map(({ matchPlayer, player, amountDue, totalPaid, totalWaiver, balance }) => {
              return (
                <article
                  key={matchPlayer.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5 lg:flex-row lg:items-center"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-[var(--mhl-panel-2)] px-2 py-0.5 text-xs font-black text-[var(--mhl-green)]">
                        {player?.jersey_number ? `#${player.jersey_number}` : "—"}
                      </span>
                      <h3 className="text-base font-black uppercase tracking-tight">
                        {player?.display_name ?? "Jugador"}
                      </h3>
                      <span className="text-xs text-[var(--mhl-muted)]">
                        ({matchPlayer.participation_status})
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        matchPlayer.attendance_status === "present"
                          ? "bg-[var(--mhl-green)]/15 text-[var(--mhl-green)]"
                          : matchPlayer.attendance_status === "absent"
                          ? "bg-[var(--mhl-red)]/15 text-[var(--mhl-red)]"
                          : "bg-neutral-800 text-[var(--mhl-muted)]"
                      }`}>
                        Asistencia: {matchPlayer.attendance_status}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs">
                      <span className="text-[var(--mhl-muted)]">
                        Debido: <strong className="text-[var(--mhl-text)]">${amountDue.toLocaleString("es-AR")}</strong>
                      </span>
                      <span className="text-[var(--mhl-muted)]">
                        Pagado: <strong className="text-[var(--mhl-green)]">${totalPaid.toLocaleString("es-AR")}</strong>
                      </span>
                      {totalWaiver > 0 && (
                        <span className="text-[var(--mhl-muted)]">
                          Cortesía: <strong className="text-[var(--mhl-yellow)]">${totalWaiver.toLocaleString("es-AR")}</strong>
                        </span>
                      )}
                      <span className="text-[var(--mhl-muted)]">
                        Saldo: <strong className={balance > 0 ? "text-[var(--mhl-red)]" : "text-[var(--mhl-green)]"}>
                          ${balance.toLocaleString("es-AR")}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* FORMULARIO DE CORTESÍA / WAIVER */}
                  {balance > 0 && (
                    <form action={grantMatchWaiverAction} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-2.5">
                      <input type="hidden" name="matchId" value={match.id} />
                      <input type="hidden" name="matchPlayerId" value={matchPlayer.id} />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black uppercase text-[var(--mhl-yellow)]">Cortesía $</span>
                        <input
                          type="number"
                          name="amount"
                          defaultValue={balance}
                          max={balance}
                          min={1}
                          step="any"
                          className="w-20 rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1 text-xs text-[var(--mhl-text)] focus:outline-none"
                          required
                        />
                      </div>
                      <input
                        type="text"
                        name="note"
                        placeholder="Motivo (opcional)"
                        className="w-36 rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-[var(--mhl-yellow)] px-3 py-1 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                      >
                        Aplicar
                      </button>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* AUDITORÍA DE MOVIMIENTOS FINANCIEROS (PAGOS & CORTESÍAS) */}
      <section className="mt-12 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-yellow)]">Auditoría Contable</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Movimientos de Pago y Cortesías</h2>
          <p className="mt-1 text-xs text-[var(--mhl-muted)]">
            Registro auditable de todas las transacciones. Los pagos nunca se eliminan físicamente: se anulan con motivo documentado.
          </p>
        </div>

        {allPayments.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-[var(--mhl-border)] p-6 text-center text-xs text-[var(--mhl-muted)]">
            No se registran movimientos de cobro o cortesía para este partido.
          </p>
        ) : (
          <div className="mt-6 space-y-3">
            {allPayments.map((pmt) => {
              const relatedMp = currentMatchPlayers.find((mp) => mp.id === pmt.match_player_id);
              const relatedPlayer = relatedMp ? playersMap.get(relatedMp.player_id) : null;
              const registrarName = profilesMap.get(pmt.registered_by) ?? pmt.registered_by;
              const voidedByName = pmt.voided_by ? profilesMap.get(pmt.voided_by) ?? pmt.voided_by : null;
              const isVoided = Boolean(pmt.voided_at);

              return (
                <div
                  key={pmt.id}
                  className={`flex flex-col justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center ${
                    isVoided
                      ? "border-neutral-800 bg-neutral-900/40 opacity-60"
                      : "border-[var(--mhl-border)] bg-[var(--mhl-panel-2)]"
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                        pmt.kind === "waiver"
                          ? "bg-[var(--mhl-yellow)]/15 text-[var(--mhl-yellow)]"
                          : "bg-[var(--mhl-green)]/15 text-[var(--mhl-green)]"
                      }`}>
                        {pmt.kind === "waiver" ? "Cortesía" : "Pago"}
                      </span>

                      <span className="text-sm font-black uppercase tracking-tight">
                        {relatedPlayer?.display_name ?? "Jugador"}
                      </span>

                      <span className="text-xs text-[var(--mhl-muted)]">·</span>

                      <span className="text-xs font-bold text-[var(--mhl-muted)]">
                        {new Date(pmt.paid_at).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>

                      {pmt.method && (
                        <span className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--mhl-muted)]">
                          Método: {pmt.method}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-xs text-[var(--mhl-muted)]">
                      Registrado por: <strong className="text-[var(--mhl-text)]">{registrarName}</strong>
                      {pmt.note ? ` · Nota: "${pmt.note}"` : ""}
                    </p>

                    {isVoided && (
                      <p className="mt-1 text-xs text-[var(--mhl-red)]">
                        <strong>ANULADO</strong> por {voidedByName} · Motivo: &ldquo;{pmt.void_reason}&rdquo;
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 sm:self-center">
                    <span className={`text-xl font-black ${isVoided ? "line-through text-[var(--mhl-muted)]" : "text-[var(--mhl-green)]"}`}>
                      ${pmt.amount.toLocaleString("es-AR")}
                    </span>

                    {!isVoided && (
                      <form action={voidMatchPaymentAction} className="flex items-center gap-2">
                        <input type="hidden" name="matchId" value={match.id} />
                        <input type="hidden" name="paymentId" value={pmt.id} />
                        <input
                          type="text"
                          name="reason"
                          placeholder="Motivo anulación"
                          className="w-36 rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1 text-xs text-[var(--mhl-text)] focus:border-[var(--mhl-red)] focus:outline-none"
                          required
                        />
                        <button
                          type="submit"
                          className="rounded-lg border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-[var(--mhl-red)] transition hover:bg-[var(--mhl-red)]/20"
                        >
                          Anular
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
