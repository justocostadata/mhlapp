import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { joinFriendlyMatch, respondMatchParticipation } from "./actions";

export default async function MatchesPage() {
  const supabase = await createClient();
  const { user } = await getAuthContext();

  // 1. Fetch current player if user is logged in
  let currentPlayer: { id: string; display_name: string } | null = null;
  if (user) {
    const { data: p } = await supabase
      .from("players")
      .select("id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    currentPlayer = p;
  }

  // 2. Fetch friendly matches, competition matches, teams
  const [
    { data: friendlyMatches },
    { data: competitionMatches },
    { data: teams },
  ] = await Promise.all([
    supabase
      .from("matches")
      .select("id, match_type, scheduled_at, venue_name, pitch, status, player_price, max_players")
      .eq("match_type", "friendly")
      .neq("status", "draft")
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("matches")
      .select("id, matchday, phase, zone, status, home_score, away_score, home_team_id, away_team_id, home_team_placeholder, away_team_placeholder")
      .neq("match_type", "friendly")
      .order("matchday", { ascending: false, nullsFirst: false })
      .limit(30),
    supabase.from("teams").select("id, name"),
  ]);

  const teamNames = new Map((teams ?? []).map((team) => [team.id, team.name]));
  const currentFriendlyMatches = friendlyMatches ?? [];
  const friendlyMatchIds = currentFriendlyMatches.map((m) => m.id);

  // 3. Fetch active participants for friendly matches
  const { data: matchPlayers } = friendlyMatchIds.length > 0
    ? await supabase
        .from("match_players")
        .select("id, match_id, player_id, participation_status")
        .in("match_id", friendlyMatchIds)
    : { data: [] };

  const matchPlayersList = matchPlayers ?? [];

  // Group active counts and map current player's registration
  const matchActiveCountMap = new Map<string, number>();
  const playerParticipationMap = new Map<string, { id: string; participation_status: string }>();

  for (const mp of matchPlayersList) {
    if (mp.participation_status !== "cancelled") {
      matchActiveCountMap.set(mp.match_id, (matchActiveCountMap.get(mp.match_id) ?? 0) + 1);
    }
    if (currentPlayer && mp.player_id === currentPlayer.id) {
      playerParticipationMap.set(mp.match_id, {
        id: mp.id,
        participation_status: mp.participation_status,
      });
    }
  }

  const statusStyles: Record<string, { bg: string; label: string }> = {
    open: { bg: "bg-[var(--mhl-green)]/15 text-[var(--mhl-green)] border-[var(--mhl-green)]/40", label: "Inscripción Abierta" },
    full: { bg: "bg-[var(--mhl-yellow)]/15 text-[var(--mhl-yellow)] border-[var(--mhl-yellow)]/40", label: "Cupos Agotados" },
    confirmed: { bg: "bg-blue-500/15 text-blue-400 border-blue-500/40", label: "Confirmado" },
    in_progress: { bg: "bg-purple-500/15 text-purple-400 border-purple-500/40", label: "En Juego" },
    completed: { bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40", label: "Finalizado" },
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-green)]">MHL</p>
      <h1 className="mt-2 text-4xl font-black uppercase tracking-[-0.04em]">Partidos</h1>

      {/* SECCIÓN 1: AMISTOSOS V1 */}
      <section className="mt-8 space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--mhl-yellow)]">Convocatoria Abierta</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Próximos Amistosos</h2>
          <p className="mt-1 text-xs text-[var(--mhl-muted)]">
            Anotate individualmente a los partidos amistosos de la comunidad. Reservá tu lugar y luego confirmá tu asistencia.
          </p>
        </div>

        {currentFriendlyMatches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-8 text-center text-sm text-[var(--mhl-muted)]">
            No hay partidos amistosos publicados en este momento. Volvé a consultar pronto.
          </div>
        ) : (
          <div className="space-y-4">
            {currentFriendlyMatches.map((match) => {
              const activeCount = matchActiveCountMap.get(match.id) ?? 0;
              const maxPlayers = match.max_players;
              const isFull = maxPlayers !== null && activeCount >= maxPlayers;
              const myParticipation = playerParticipationMap.get(match.id);
              const myStatus = myParticipation?.participation_status;
              const isReserved = myStatus === "reserved";
              const isConfirmed = myStatus === "confirmed";
              const canJoin = (match.status === "open" || match.status === "full") && !isFull && !isReserved && !isConfirmed;

              const badge = statusStyles[match.status] || {
                bg: "bg-neutral-800 text-neutral-300 border-neutral-700",
                label: match.status,
              };

              return (
                <article
                  key={match.id}
                  className={`flex flex-col justify-between gap-5 rounded-2xl border p-6 transition ${
                    isReserved
                      ? "border-[var(--mhl-yellow)]/60 bg-[var(--mhl-panel)] shadow-[0_0_25px_rgba(239,199,94,0.08)]"
                      : isConfirmed
                      ? "border-[var(--mhl-green)]/60 bg-[var(--mhl-panel)] shadow-[0_0_25px_rgba(57,217,160,0.08)]"
                      : "border-[var(--mhl-border)] bg-[var(--mhl-panel)] hover:border-[#3e4c44]"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${badge.bg}`}>
                          {badge.label}
                        </span>
                        <span className="rounded-md border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-2.5 py-1 text-[10px] font-bold uppercase text-[var(--mhl-muted)]">
                          Amistoso
                        </span>
                      </div>

                      <span className="font-bold text-[var(--mhl-muted)]">
                        {match.scheduled_at
                          ? new Date(match.scheduled_at).toLocaleDateString("es-AR", {
                              weekday: "long",
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Fecha a coordinar"}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight">
                        {match.venue_name || "Predio a definir"}
                      </h3>
                      <p className="mt-0.5 text-xs text-[var(--mhl-muted)]">
                        {match.pitch ? `Cancha: ${match.pitch}` : "Cancha a designar"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <div className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-1.5">
                        <span className="text-[10px] font-black uppercase text-[var(--mhl-muted)]">Anotados: </span>
                        <strong className="text-[var(--mhl-green)]">{activeCount} / {maxPlayers ?? "∞"}</strong>
                      </div>

                      <div className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-1.5">
                        <span className="text-[10px] font-black uppercase text-[var(--mhl-muted)]">Precio: </span>
                        <strong className="text-[var(--mhl-text)]">${match.player_price?.toLocaleString("es-AR") ?? "0"}</strong>
                      </div>
                    </div>
                  </div>

                  {/* ESTADOS Y ACCIONES DEL JUGADOR */}
                  <div className="border-t border-[var(--mhl-border)]/60 pt-4">
                    {!user ? (
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-xs text-[var(--mhl-muted)]">Iniciá sesión para anotarte a este partido.</p>
                        <Link
                          href="/login"
                          className="rounded-xl bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-black transition hover:brightness-90"
                        >
                          Ingresar
                        </Link>
                      </div>
                    ) : !currentPlayer ? (
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-xs text-[var(--mhl-muted)]">
                          Tu cuenta no tiene un perfil de jugador vinculado para anotarse.
                        </p>
                        <Link
                          href="/mi-perfil"
                          className="rounded-xl border border-[var(--mhl-green)]/50 bg-[var(--mhl-green)]/15 px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-green)] transition hover:bg-[var(--mhl-green)]/25"
                        >
                          Reclamar perfil &rarr;
                        </Link>
                      </div>
                    ) : myParticipation && isReserved ? (
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--mhl-yellow)]" />
                          <span className="text-xs font-black uppercase tracking-wider text-[var(--mhl-yellow)]">
                            RESERVADO — Confirmá tu asistencia
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <form action={respondMatchParticipation}>
                            <input type="hidden" name="matchPlayerId" value={myParticipation.id} />
                            <input type="hidden" name="decision" value="cancel" />
                            <button
                              type="submit"
                              className="rounded-xl border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-red)] transition hover:bg-[var(--mhl-red)]/20"
                            >
                              Cancelar
                            </button>
                          </form>

                          <form action={respondMatchParticipation}>
                            <input type="hidden" name="matchPlayerId" value={myParticipation.id} />
                            <input type="hidden" name="decision" value="confirm" />
                            <button
                              type="submit"
                              className="rounded-xl bg-[var(--mhl-green)] px-5 py-2 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                            >
                              CONFIRMAR
                            </button>
                          </form>
                        </div>
                      </div>
                    ) : myParticipation && isConfirmed ? (
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-[var(--mhl-green)]" />
                          <span className="text-xs font-black uppercase tracking-wider text-[var(--mhl-green)]">
                            CONFIRMADO — Estás en la lista oficial
                          </span>
                        </div>

                        {(match.status === "open" || match.status === "full" || match.status === "confirmed") && (
                          <form action={respondMatchParticipation}>
                            <input type="hidden" name="matchPlayerId" value={myParticipation.id} />
                            <input type="hidden" name="decision" value="cancel" />
                            <button
                              type="submit"
                              className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-muted)] transition hover:border-[var(--mhl-red)] hover:text-[var(--mhl-red)]"
                            >
                              Cancelar participación
                            </button>
                          </form>
                        )}
                      </div>
                    ) : canJoin ? (
                      <form action={joinFriendlyMatch} className="flex justify-end">
                        <input type="hidden" name="matchId" value={match.id} />
                        <button
                          type="submit"
                          className="rounded-xl bg-[var(--mhl-green)] px-6 py-2.5 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                        >
                          ANOTARME
                        </button>
                      </form>
                    ) : (
                      <p className="text-right text-xs font-bold uppercase tracking-wider text-[var(--mhl-muted)]">
                        {isFull ? "Cupos agotados" : "Inscripción no disponible"}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* SECCIÓN 2: PARTIDOS OFICIALES DE COMPETENCIA */}
      {(competitionMatches ?? []).length > 0 && (
        <section className="mt-14 space-y-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--mhl-muted)]">Fixture de Liga</p>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Competencia Oficial</h2>
          </div>

          <div className="space-y-3">
            {(competitionMatches ?? []).map((match) => {
              const home = (match.home_team_id ? teamNames.get(match.home_team_id) : null) ?? match.home_team_placeholder ?? "A definir";
              const away = (match.away_team_id ? teamNames.get(match.away_team_id) : null) ?? match.away_team_placeholder ?? "A definir";

              return (
                <article key={match.id} className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
                  <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--mhl-muted)]">
                    <span>Fecha {match.matchday ?? "—"} {match.phase ? `· Fase ${match.phase}` : ""}</span>
                    <span className="uppercase">{match.status}</span>
                  </div>
                  <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <p className="font-black uppercase">{home}</p>
                    <p className="text-xl font-black">{match.home_score ?? "—"} : {match.away_score ?? "—"}</p>
                    <p className="text-right font-black uppercase">{away}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
