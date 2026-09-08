import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PlanilleroPage() {
  const { user } = await requireRole("planillero");
  const supabase = await createClient();

  const { data: assignedMatches } = await supabase
    .from("matches")
    .select(
      "id, match_type, scheduled_at, venue_name, pitch, status, player_price, team_price, max_players, home_score, away_score, home_team_id, away_team_id"
    )
    .eq("scorekeeper_user_id", user.id)
    .order("scheduled_at", { ascending: false });

  const matchesList = assignedMatches ?? [];
  const matchIds = matchesList.map((match) => match.id);
  const competitionTeamIds = Array.from(
    new Set(
      matchesList
        .flatMap((match) => [match.home_team_id, match.away_team_id])
        .filter(Boolean) as string[]
    )
  );

  const [{ data: activePlayers }, { data: teamsData }] = await Promise.all([
    matchIds.length > 0
      ? supabase
          .from("match_players")
          .select("id, match_id, participation_status")
          .in("match_id", matchIds)
          .neq("participation_status", "cancelled")
      : Promise.resolve({ data: [] }),
    competitionTeamIds.length > 0
      ? supabase.from("teams").select("id, name").in("id", competitionTeamIds)
      : Promise.resolve({ data: [] }),
  ]);

  const activeCountMap = new Map<string, number>();
  for (const player of activePlayers ?? []) {
    activeCountMap.set(player.match_id, (activeCountMap.get(player.match_id) ?? 0) + 1);
  }

  const teamNames = new Map((teamsData ?? []).map((team) => [team.id, team.name]));

  const statusStyles: Record<string, { bg: string; label: string }> = {
    draft: { bg: "bg-neutral-800 text-neutral-300 border-neutral-700", label: "Borrador" },
    open: { bg: "bg-[var(--mhl-green)]/15 text-[var(--mhl-green)] border-[var(--mhl-green)]/40", label: "Abierto" },
    full: { bg: "bg-[var(--mhl-yellow)]/15 text-[var(--mhl-yellow)] border-[var(--mhl-yellow)]/40", label: "Cupo Lleno" },
    confirmed: { bg: "bg-blue-500/15 text-blue-400 border-blue-500/40", label: "Confirmado" },
    in_progress: { bg: "bg-purple-500/15 text-purple-400 border-purple-500/40", label: "En Juego" },
    completed: { bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40", label: "Finalizado" },
    cancelled: { bg: "bg-[var(--mhl-red)]/15 text-[var(--mhl-red)] border-[var(--mhl-red)]/40", label: "Cancelado" },
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-yellow)]">Mesa de Control</p>
          <h1 className="mt-1 text-3xl font-black uppercase tracking-tight sm:text-4xl">Planillero Oficial</h1>
          <p className="mt-1 text-xs text-[var(--mhl-muted)]">
            Partidos donde fuiste designado para registrar asistencia, cobros y resultados.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-4 py-2.5 text-right">
          <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Asignados</p>
          <p className="text-xl font-black text-[var(--mhl-yellow)]">{matchesList.length}</p>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        {matchesList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-10 text-center text-sm text-[var(--mhl-muted)]">
            <p className="font-bold text-[var(--mhl-text)]">No tenés partidos asignados actualmente.</p>
            <p className="mt-1 text-xs">Cuando un administrador te asigne como planillero principal, aparecerá acá.</p>
          </div>
        ) : (
          matchesList.map((match) => {
            const count = activeCountMap.get(match.id) ?? 0;
            const style = statusStyles[match.status] ?? { bg: "bg-neutral-800 text-neutral-300", label: match.status };
            const isInProgress = match.status === "in_progress";
            const isCompleted = match.status === "completed";
            const isCompetition = match.match_type === "competition";
            const homeName = match.home_team_id ? teamNames.get(match.home_team_id) ?? "Local" : "Local";
            const awayName = match.away_team_id ? teamNames.get(match.away_team_id) ?? "Visitante" : "Visitante";

            return (
              <article
                key={match.id}
                className={`flex flex-col justify-between gap-5 rounded-2xl border p-5 transition sm:flex-row sm:items-center ${
                  isInProgress
                    ? "border-purple-500/60 bg-[var(--mhl-panel)] shadow-[0_0_25px_rgba(168,85,247,0.1)]"
                    : "border-[var(--mhl-border)] bg-[var(--mhl-panel)] hover:border-[#3e4c44]"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-lg border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${style.bg}`}>{style.label}</span>
                    <span className="rounded-md border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-2 py-0.5 text-[10px] font-black uppercase text-[var(--mhl-muted)]">
                      {isCompetition ? "Competencia" : "Amistoso"}
                    </span>
                    {match.scheduled_at && (
                      <span className="text-xs font-bold text-[var(--mhl-muted)]">
                        {new Date(match.scheduled_at).toLocaleDateString("es-AR", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>

                  <h2 className="text-xl font-black uppercase tracking-tight">
                    {isCompetition ? `${homeName} vs ${awayName}` : match.venue_name || "Lugar a designar"}
                  </h2>

                  <p className="text-xs text-[var(--mhl-muted)]">
                    {match.venue_name || "Lugar a designar"} {match.pitch ? `· Cancha ${match.pitch}` : ""}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--mhl-muted)]">
                    <span>{isCompetition ? "Convocados" : "Jugadores"}: <strong className="text-[var(--mhl-green)]">{count}{isCompetition ? "" : ` / ${match.max_players ?? "—"}`}</strong></span>
                    {isCompetition ? (
                      <span>Tarifa por equipo: <strong className="text-[var(--mhl-text)]">${match.team_price?.toLocaleString("es-AR") ?? "0"}</strong></span>
                    ) : (
                      <span>Tarifa jugador: <strong className="text-[var(--mhl-text)]">${match.player_price?.toLocaleString("es-AR") ?? "0"}</strong></span>
                    )}
                    {isCompleted && (
                      <span>Resultado: <strong className="text-emerald-400">{match.home_score} : {match.away_score}</strong></span>
                    )}
                  </div>
                </div>

                <div>
                  <Link
                    href={`/planillero/${match.id}`}
                    className={`block w-full rounded-xl px-5 py-3 text-center text-xs font-black uppercase tracking-wider transition sm:w-auto ${
                      isInProgress
                        ? "bg-purple-500 text-white shadow-lg hover:bg-purple-600"
                        : "bg-[var(--mhl-yellow)] text-[#080b0a] hover:brightness-110"
                    }`}
                  >
                    {isInProgress ? "Planilla en Vivo →" : isCompleted ? "Ver Planilla Cerrada →" : "Abrir Planilla →"}
                  </Link>
                </div>
              </article>
            );
          })
        )}
      </div>
    </main>
  );
}
