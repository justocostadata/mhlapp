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
  recordMatchTeamPaymentAction,
  grantMatchTeamWaiverAction,
  voidMatchTeamPaymentAction,
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

  const isCompetition = match.match_type === "competition";

  // 2. Fetch shared related data
  const [
    { data: profiles },
    { data: matchPlayers },
    competitionRes,
    teamsRes,
    teamFinancialsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("id, display_name").order("display_name"),
    supabase
      .from("match_players")
      .select("id, match_id, player_id, team_id, side, participation_status, attendance_status, minutes_played, updated_at")
      .eq("match_id", id),
    isCompetition && match.competition_id
      ? supabase.from("competitions").select("id, name").eq("id", match.competition_id).single()
      : Promise.resolve({ data: null }),
    isCompetition && (match.home_team_id || match.away_team_id)
      ? supabase
          .from("teams")
          .select("id, name, short_name, logo_url")
          .in("id", [match.home_team_id, match.away_team_id].filter(Boolean) as string[])
      : Promise.resolve({ data: [] }),
    isCompetition
      ? supabase.from("match_team_financials").select("*").eq("match_id", id)
      : Promise.resolve({ data: [] }),
  ]);

  const profilesMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name || p.id]));
  const currentMatchPlayers = matchPlayers ?? [];
  const playerIds = currentMatchPlayers.map((mp) => mp.player_id);
  const matchPlayerIds = currentMatchPlayers.map((mp) => mp.id);

  // Competition teams map
  const teamsMap = new Map((teamsRes.data ?? []).map((t) => [t.id, t]));
  const homeTeam = match.home_team_id ? teamsMap.get(match.home_team_id) : null;
  const awayTeam = match.away_team_id ? teamsMap.get(match.away_team_id) : null;
  const competitionName = competitionRes.data?.name;

  // 3. Conditional queries based on match type
  const teamFinancials = teamFinancialsRes.data ?? [];
  const teamFinancialIds = teamFinancials.map((f) => f.id);

  const [
    { data: playersData },
    { data: financialsData },
    { data: paymentsData },
    { data: teamPaymentsData },
  ] = await Promise.all([
    playerIds.length > 0
      ? supabase.from("players").select("id, display_name, jersey_number, position, category").in("id", playerIds)
      : { data: [] },
    // Friendly individual financials
    !isCompetition && matchPlayerIds.length > 0
      ? supabase.from("match_player_financials").select("match_player_id, amount_due").in("match_player_id", matchPlayerIds)
      : { data: [] },
    // Friendly individual payments
    !isCompetition && matchPlayerIds.length > 0
      ? supabase
          .from("match_payments")
          .select("id, match_player_id, kind, amount, method, note, registered_by, paid_at, voided_at, voided_by, void_reason")
          .in("match_player_id", matchPlayerIds)
          .order("paid_at", { ascending: false })
      : { data: [] },
    // Competition team payments
    isCompetition && teamFinancialIds.length > 0
      ? supabase
          .from("match_team_payments")
          .select("id, financial_id, kind, amount, method, note, paid_by_user_id, registered_by, paid_at, voided_at, voided_by, void_reason")
          .in("financial_id", teamFinancialIds)
          .order("paid_at", { ascending: false })
      : { data: [] },
  ]);

  const playersMap = new Map((playersData ?? []).map((p) => [p.id, p]));

  // --- FRIENDLY FINANCIAL CALCULATIONS ---
  const financialsMap = new Map((financialsData ?? []).map((f) => [f.match_player_id, f.amount_due]));
  const allPayments = paymentsData ?? [];
  const playerPaymentsMap = new Map<string, typeof allPayments>();
  for (const pay of allPayments) {
    const list = playerPaymentsMap.get(pay.match_player_id) ?? [];
    list.push(pay);
    playerPaymentsMap.set(pay.match_player_id, list);
  }

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

  // --- COMPETITION FINANCIAL CALCULATIONS ---
  const allTeamPayments = teamPaymentsData ?? [];
  const homeFinancial = teamFinancials.find((f) => f.team_id === match.home_team_id);
  const awayFinancial = teamFinancials.find((f) => f.team_id === match.away_team_id);

  const getTeamStats = (financial: typeof homeFinancial) => {
    if (!financial) return { due: 0, paid: 0, waiver: 0, balance: 0, payments: [] };
    const payments = allTeamPayments.filter((p) => p.financial_id === financial.id);
    let paid = 0;
    let waiver = 0;
    for (const p of payments) {
      if (!p.voided_at) {
        if (p.kind === "payment") paid += p.amount;
        if (p.kind === "waiver") waiver += p.amount;
      }
    }
    const balance = Math.max(0, financial.amount_due - paid - waiver);
    return {
      due: financial.amount_due,
      paid,
      waiver,
      balance,
      payments,
    };
  };

  const homeStats = getTeamStats(homeFinancial);
  const awayStats = getTeamStats(awayFinancial);

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
              Tipo: {isCompetition ? "Competencia" : "Amistoso"}
            </span>
            {competitionName && (
              <span className="rounded-lg border border-[var(--mhl-yellow)]/30 bg-[var(--mhl-yellow)]/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-[var(--mhl-yellow)]">
                {competitionName}
              </span>
            )}
          </div>

          <h1 className="mt-3 text-3xl font-black uppercase tracking-tight sm:text-4xl">
            {isCompetition ? (
              `${homeTeam?.name || "Equipo Local"} vs ${awayTeam?.name || "Equipo Visitante"}`
            ) : (
              `${match.venue_name || "Predio a definir"} ${match.pitch ? `· Cancha ${match.pitch}` : ""}`
            )}
          </h1>

          <p className="mt-1 text-sm font-bold text-[var(--mhl-muted)]">
            {isCompetition && (
              <span className="mr-2 text-[var(--mhl-text)]">
                {match.venue_name ? `${match.venue_name}${match.pitch ? ` (Cancha ${match.pitch})` : ""} · ` : ""}
                {match.matchday ? `Jornada ${match.matchday} · ` : ""}
              </span>
            )}
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
                Publicar Partido
              </button>
            </form>
          )}

          {!isCompetition ? (
            <>
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
            </>
          ) : (
            <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-4 py-2.5 text-right">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Tarifa por Equipo</p>
              <p className="text-xl font-black text-[var(--mhl-green)]">
                ${match.team_price?.toLocaleString("es-AR") ?? "0"}
              </p>
            </div>
          )}
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

      {/* ============================================================ */}
      {/* SECCIÓN COMPETICIÓN: FINANZAS SEPARADAS POR EQUIPO           */}
      {/* ============================================================ */}
      {isCompetition ? (
        <section className="mt-10 space-y-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-green)]">Motor Financiero de Competencia</p>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Finanzas por Franquicia</h2>
            <p className="mt-1 text-xs text-[var(--mhl-muted)]">
              En partidos competitivos cada equipo abona su tarifa fijada. Podés registrar pagos, aplicar cortesías y anular movimientos auditados.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* EQUIPO LOCAL */}
            <div className="rounded-3xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-blue-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-blue-400">
                  Local
                </span>
                <span className="text-xs text-[var(--mhl-muted)]">Franquicia Local</span>
              </div>

              <h3 className="mt-2 text-2xl font-black uppercase tracking-tight">
                {homeTeam?.name || "Equipo Local"}
              </h3>

              {/* Métricas Local */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-[var(--mhl-panel-2)] p-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Deuda</p>
                  <p className="mt-1 text-lg font-black">${homeStats.due.toLocaleString("es-AR")}</p>
                </div>
                <div className="rounded-xl bg-[var(--mhl-panel-2)] p-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[var(--mhl-green)]">Abonado</p>
                  <p className="mt-1 text-lg font-black text-[var(--mhl-green)]">${homeStats.paid.toLocaleString("es-AR")}</p>
                </div>
                <div className="rounded-xl bg-[var(--mhl-panel-2)] p-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[var(--mhl-yellow)]">Cortesía</p>
                  <p className="mt-1 text-lg font-black text-[var(--mhl-yellow)]">${homeStats.waiver.toLocaleString("es-AR")}</p>
                </div>
                <div className="rounded-xl bg-[var(--mhl-panel-2)] p-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[var(--mhl-red)]">Saldo</p>
                  <p className="mt-1 text-lg font-black text-[var(--mhl-red)]">${homeStats.balance.toLocaleString("es-AR")}</p>
                </div>
              </div>

              {/* Acciones de cobro y cortesía para Local */}
              {homeFinancial && homeStats.balance > 0 && (
                <div className="mt-6 space-y-4 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-4">
                  {/* Registrar Pago */}
                  <form action={recordMatchTeamPaymentAction} className="space-y-2">
                    <input type="hidden" name="financialId" value={homeFinancial.id} />
                    <input type="hidden" name="matchId" value={match.id} />
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-green)]">Registrar Cobro (Local)</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div>
                        <input
                          type="number"
                          name="amount"
                          defaultValue={homeStats.balance}
                          max={homeStats.balance}
                          min={1}
                          step="any"
                          placeholder="Monto"
                          className="w-full rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2.5 py-1.5 text-xs text-[var(--mhl-text)] focus:outline-none"
                          required
                        />
                      </div>
                      <div>
                        <select
                          name="method"
                          defaultValue="transfer"
                          className="w-full rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1.5 text-xs text-[var(--mhl-text)] focus:outline-none"
                          required
                        >
                          <option value="cash">Efectivo</option>
                          <option value="transfer">Transferencia</option>
                          <option value="mercadopago">Mercado Pago</option>
                          <option value="other">Otro</option>
                        </select>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <button
                          type="submit"
                          className="w-full rounded-lg bg-[var(--mhl-green)] px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                        >
                          Cobrar
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      name="note"
                      placeholder="Nota de cobro (opcional)"
                      className="w-full rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2.5 py-1 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:outline-none"
                    />
                  </form>

                  {/* Aplicar Cortesía */}
                  <form action={grantMatchTeamWaiverAction} className="border-t border-[var(--mhl-border)] pt-3 space-y-2">
                    <input type="hidden" name="financialId" value={homeFinancial.id} />
                    <input type="hidden" name="matchId" value={match.id} />
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-yellow)]">Aplicar Cortesía / Waiver (Local)</p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="number"
                        name="amount"
                        defaultValue={homeStats.balance}
                        max={homeStats.balance}
                        min={1}
                        step="any"
                        placeholder="Monto"
                        className="w-24 rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2.5 py-1.5 text-xs text-[var(--mhl-text)] focus:outline-none"
                        required
                      />
                      <input
                        type="text"
                        name="note"
                        placeholder="Motivo (opcional)"
                        className="flex-1 rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2.5 py-1.5 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-[var(--mhl-yellow)] px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                      >
                        Cortesía
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Movimientos Local */}
              <div className="mt-6 border-t border-[var(--mhl-border)] pt-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Movimientos de {homeTeam?.name || "Local"}</p>
                {homeStats.payments.length === 0 ? (
                  <p className="mt-2 text-xs italic text-[var(--mhl-muted)]">Sin movimientos registrados aún.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {homeStats.payments.map((p) => {
                      const isVoided = Boolean(p.voided_at);
                      const registrarName = profilesMap.get(p.registered_by) ?? p.registered_by;
                      return (
                        <div
                          key={p.id}
                          className={`rounded-xl border p-3 text-xs ${
                            isVoided ? "border-neutral-800 bg-neutral-900/40 opacity-60" : "border-[var(--mhl-border)] bg-[var(--mhl-panel-2)]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                                p.kind === "waiver" ? "bg-[var(--mhl-yellow)]/15 text-[var(--mhl-yellow)]" : "bg-[var(--mhl-green)]/15 text-[var(--mhl-green)]"
                              }`}>
                                {p.kind === "waiver" ? "Cortesía" : "Pago"}
                              </span>
                              {p.method && <span className="text-[10px] text-[var(--mhl-muted)]">({p.method})</span>}
                              <span className="font-bold text-[var(--mhl-muted)]">
                                {new Date(p.paid_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <span className={`font-black ${isVoided ? "line-through text-[var(--mhl-muted)]" : "text-[var(--mhl-green)]"}`}>
                              ${p.amount.toLocaleString("es-AR")}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-[var(--mhl-muted)]">
                            Registrado por: {registrarName} {p.note ? `· "${p.note}"` : ""}
                          </p>
                          {isVoided && (
                            <p className="mt-1 text-[11px] text-[var(--mhl-red)]">
                              ANULADO · Motivo: &ldquo;{p.void_reason}&rdquo;
                            </p>
                          )}
                          {!isVoided && (
                            <form action={voidMatchTeamPaymentAction} className="mt-2 flex items-center gap-2">
                              <input type="hidden" name="paymentId" value={p.id} />
                              <input type="hidden" name="matchId" value={match.id} />
                              <input
                                type="text"
                                name="reason"
                                placeholder="Motivo anulación"
                                className="flex-1 rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1 text-[11px] text-[var(--mhl-text)] focus:border-[var(--mhl-red)] focus:outline-none"
                                required
                              />
                              <button
                                type="submit"
                                className="rounded-lg border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/10 px-2.5 py-1 text-[10px] font-black uppercase text-[var(--mhl-red)] hover:bg-[var(--mhl-red)]/20"
                              >
                                Anular
                              </button>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* EQUIPO VISITANTE */}
            <div className="rounded-3xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-purple-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-purple-400">
                  Visitante
                </span>
                <span className="text-xs text-[var(--mhl-muted)]">Franquicia Visitante</span>
              </div>

              <h3 className="mt-2 text-2xl font-black uppercase tracking-tight">
                {awayTeam?.name || "Equipo Visitante"}
              </h3>

              {/* Métricas Visitante */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-[var(--mhl-panel-2)] p-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Deuda</p>
                  <p className="mt-1 text-lg font-black">${awayStats.due.toLocaleString("es-AR")}</p>
                </div>
                <div className="rounded-xl bg-[var(--mhl-panel-2)] p-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[var(--mhl-green)]">Abonado</p>
                  <p className="mt-1 text-lg font-black text-[var(--mhl-green)]">${awayStats.paid.toLocaleString("es-AR")}</p>
                </div>
                <div className="rounded-xl bg-[var(--mhl-panel-2)] p-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[var(--mhl-yellow)]">Cortesía</p>
                  <p className="mt-1 text-lg font-black text-[var(--mhl-yellow)]">${awayStats.waiver.toLocaleString("es-AR")}</p>
                </div>
                <div className="rounded-xl bg-[var(--mhl-panel-2)] p-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[var(--mhl-red)]">Saldo</p>
                  <p className="mt-1 text-lg font-black text-[var(--mhl-red)]">${awayStats.balance.toLocaleString("es-AR")}</p>
                </div>
              </div>

              {/* Acciones de cobro y cortesía para Visitante */}
              {awayFinancial && awayStats.balance > 0 && (
                <div className="mt-6 space-y-4 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-4">
                  {/* Registrar Pago */}
                  <form action={recordMatchTeamPaymentAction} className="space-y-2">
                    <input type="hidden" name="financialId" value={awayFinancial.id} />
                    <input type="hidden" name="matchId" value={match.id} />
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-green)]">Registrar Cobro (Visitante)</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div>
                        <input
                          type="number"
                          name="amount"
                          defaultValue={awayStats.balance}
                          max={awayStats.balance}
                          min={1}
                          step="any"
                          placeholder="Monto"
                          className="w-full rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2.5 py-1.5 text-xs text-[var(--mhl-text)] focus:outline-none"
                          required
                        />
                      </div>
                      <div>
                        <select
                          name="method"
                          defaultValue="transfer"
                          className="w-full rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1.5 text-xs text-[var(--mhl-text)] focus:outline-none"
                          required
                        >
                          <option value="cash">Efectivo</option>
                          <option value="transfer">Transferencia</option>
                          <option value="mercadopago">Mercado Pago</option>
                          <option value="other">Otro</option>
                        </select>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <button
                          type="submit"
                          className="w-full rounded-lg bg-[var(--mhl-green)] px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                        >
                          Cobrar
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      name="note"
                      placeholder="Nota de cobro (opcional)"
                      className="w-full rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2.5 py-1 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:outline-none"
                    />
                  </form>

                  {/* Aplicar Cortesía */}
                  <form action={grantMatchTeamWaiverAction} className="border-t border-[var(--mhl-border)] pt-3 space-y-2">
                    <input type="hidden" name="financialId" value={awayFinancial.id} />
                    <input type="hidden" name="matchId" value={match.id} />
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-yellow)]">Aplicar Cortesía / Waiver (Visitante)</p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="number"
                        name="amount"
                        defaultValue={awayStats.balance}
                        max={awayStats.balance}
                        min={1}
                        step="any"
                        placeholder="Monto"
                        className="w-24 rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2.5 py-1.5 text-xs text-[var(--mhl-text)] focus:outline-none"
                        required
                      />
                      <input
                        type="text"
                        name="note"
                        placeholder="Motivo (opcional)"
                        className="flex-1 rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2.5 py-1.5 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-[var(--mhl-yellow)] px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                      >
                        Cortesía
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Movimientos Visitante */}
              <div className="mt-6 border-t border-[var(--mhl-border)] pt-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Movimientos de {awayTeam?.name || "Visitante"}</p>
                {awayStats.payments.length === 0 ? (
                  <p className="mt-2 text-xs italic text-[var(--mhl-muted)]">Sin movimientos registrados aún.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {awayStats.payments.map((p) => {
                      const isVoided = Boolean(p.voided_at);
                      const registrarName = profilesMap.get(p.registered_by) ?? p.registered_by;
                      return (
                        <div
                          key={p.id}
                          className={`rounded-xl border p-3 text-xs ${
                            isVoided ? "border-neutral-800 bg-neutral-900/40 opacity-60" : "border-[var(--mhl-border)] bg-[var(--mhl-panel-2)]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                                p.kind === "waiver" ? "bg-[var(--mhl-yellow)]/15 text-[var(--mhl-yellow)]" : "bg-[var(--mhl-green)]/15 text-[var(--mhl-green)]"
                              }`}>
                                {p.kind === "waiver" ? "Cortesía" : "Pago"}
                              </span>
                              {p.method && <span className="text-[10px] text-[var(--mhl-muted)]">({p.method})</span>}
                              <span className="font-bold text-[var(--mhl-muted)]">
                                {new Date(p.paid_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <span className={`font-black ${isVoided ? "line-through text-[var(--mhl-muted)]" : "text-[var(--mhl-green)]"}`}>
                              ${p.amount.toLocaleString("es-AR")}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-[var(--mhl-muted)]">
                            Registrado por: {registrarName} {p.note ? `· "${p.note}"` : ""}
                          </p>
                          {isVoided && (
                            <p className="mt-1 text-[11px] text-[var(--mhl-red)]">
                              ANULADO · Motivo: &ldquo;{p.void_reason}&rdquo;
                            </p>
                          )}
                          {!isVoided && (
                            <form action={voidMatchTeamPaymentAction} className="mt-2 flex items-center gap-2">
                              <input type="hidden" name="paymentId" value={p.id} />
                              <input type="hidden" name="matchId" value={match.id} />
                              <input
                                type="text"
                                name="reason"
                                placeholder="Motivo anulación"
                                className="flex-1 rounded-lg border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-2 py-1 text-[11px] text-[var(--mhl-text)] focus:border-[var(--mhl-red)] focus:outline-none"
                                required
                              />
                              <button
                                type="submit"
                                className="rounded-lg border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/10 px-2.5 py-1 text-[10px] font-black uppercase text-[var(--mhl-red)] hover:bg-[var(--mhl-red)]/20"
                              >
                                Anular
                              </button>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* JUGADORES CONVOCADOS POR EQUIPO (SIN DEUDA INDIVIDUAL) */}
          <div className="rounded-3xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
            <h3 className="text-xl font-black uppercase tracking-tight">Convocados del Partido</h3>
            <p className="mt-0.5 text-xs text-[var(--mhl-muted)]">
              Jugadores convocados por los Directores Técnicos de cada franquicia. En competencia no existe deuda por jugador.
            </p>

            {currentMatchPlayers.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-[var(--mhl-border)] p-6 text-center text-xs text-[var(--mhl-muted)]">
                Aún no hay jugadores convocados para este partido.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {currentMatchPlayers.map((mp) => {
                  const p = playersMap.get(mp.player_id);
                  const isHome = mp.side === "home" || mp.team_id === match.home_team_id;
                  const teamName = isHome ? homeTeam?.name || "Local" : awayTeam?.name || "Visitante";

                  return (
                    <div
                      key={mp.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-3 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${
                          isHome ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"
                        }`}>
                          {teamName}
                        </span>
                        <span className="font-bold text-[var(--mhl-green)]">
                          {p?.jersey_number ? `#${p.jersey_number}` : "—"}
                        </span>
                        <span className="font-black uppercase text-[var(--mhl-text)]">
                          {p?.display_name ?? "Jugador"}
                        </span>
                        <span className="text-[11px] text-[var(--mhl-muted)]">
                          ({p?.position ?? "Jugador"})
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          mp.participation_status === "confirmed"
                            ? "bg-[var(--mhl-green)]/15 text-[var(--mhl-green)]"
                            : mp.participation_status === "reserved"
                            ? "bg-[var(--mhl-yellow)]/15 text-[var(--mhl-yellow)]"
                            : "bg-neutral-800 text-[var(--mhl-muted)]"
                        }`}>
                          {mp.participation_status === "reserved"
                            ? "Convocado"
                            : mp.participation_status === "confirmed"
                            ? "Confirmado"
                            : mp.participation_status}
                        </span>
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          mp.attendance_status === "present"
                            ? "bg-[var(--mhl-green)]/15 text-[var(--mhl-green)]"
                            : mp.attendance_status === "absent"
                            ? "bg-[var(--mhl-red)]/15 text-[var(--mhl-red)]"
                            : "bg-neutral-800 text-[var(--mhl-muted)]"
                        }`}>
                          Asistencia: {mp.attendance_status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ) : (
        /* ============================================================ */
        /* SECCIÓN AMISTOSO V1 (INDIVIDUAL)                             */
        /* ============================================================ */
        <>
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
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-green)]">Motor Financiero Individual</p>
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
        </>
      )}
    </main>
  );
}
