import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { joinFriendlyMatch, respondMatchParticipation } from "./actions";

export default async function MatchesPage() {
  const supabase = await createClient();
  const { user } = await getAuthContext();

  let currentPlayer: { id: string; display_name: string } | null = null;
  if (user) {
    const { data } = await supabase
      .from("players")
      .select("id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    currentPlayer = data;
  }

  const [friendlyResult, fixtureResult, teamsResult, myParticipationsResult] = await Promise.all([
    supabase
      .from("matches")
      .select("id, match_type, scheduled_at, venue_name, pitch, status, player_price, max_players")
      .eq("match_type", "friendly")
      .in("status", ["open", "full", "confirmed", "in_progress"])
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("matches")
      .select(
        "id, match_type, scheduled_at, venue_name, pitch, matchday, phase, zone, status, home_score, away_score, home_team_id, away_team_id, home_team_placeholder, away_team_placeholder"
      )
      .eq("match_type", "competition")
      .neq("status", "draft")
      .order("scheduled_at", { ascending: false, nullsFirst: false })
      .limit(30),
    supabase.from("teams").select("id, name"),
    currentPlayer
      ? supabase
          .from("match_players")
          .select("id, match_id, player_id, team_id, side, participation_status")
          .eq("player_id", currentPlayer.id)
      : Promise.resolve({ data: [] }),
  ]);

  const friendlyMatches = friendlyResult.data ?? [];
  const fixtureMatches = fixtureResult.data ?? [];
  const teams = teamsResult.data ?? [];
  const myParticipations = myParticipationsResult.data ?? [];

  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const friendlyMatchIds = friendlyMatches.map((match) => match.id);

  const friendlyPlayersResult = friendlyMatchIds.length
    ? await supabase
        .from("match_players")
        .select("id, match_id, player_id, participation_status")
        .in("match_id", friendlyMatchIds)
    : { data: [] };

  const friendlyPlayers = friendlyPlayersResult.data ?? [];
  const friendlyCountMap = new Map<string, number>();
  const friendlyParticipationMap = new Map<string, { id: string; participation_status: string }>();

  for (const mp of friendlyPlayers) {
    if (mp.participation_status !== "cancelled") {
      friendlyCountMap.set(mp.match_id, (friendlyCountMap.get(mp.match_id) ?? 0) + 1);
    }
    if (currentPlayer && mp.player_id === currentPlayer.id) {
      friendlyParticipationMap.set(mp.match_id, {
        id: mp.id,
        participation_status: mp.participation_status,
      });
    }
  }

  const invitationMatchIds = myParticipations.map((mp) => mp.match_id);
  const invitedMatchesResult = invitationMatchIds.length
    ? await supabase
        .from("matches")
        .select(
          "id, match_type, scheduled_at, venue_name, pitch, status, home_team_id, away_team_id, matchday, phase, zone"
        )
        .eq("match_type", "competition")
        .in("id", invitationMatchIds)
        .order("scheduled_at", { ascending: true, nullsFirst: false })
    : { data: [] };

  const invitedMatchesMap = new Map((invitedMatchesResult.data ?? []).map((match) => [match.id, match]));
  const invitations = myParticipations.flatMap((participation) => {
    const match = invitedMatchesMap.get(participation.match_id);
    return match ? [{ participation, match }] : [];
  });

  const statusStyles: Record<string, { bg: string; label: string }> = {
    open: {
      bg: "bg-[var(--mhl-green)]/15 text-[var(--mhl-green)] border-[var(--mhl-green)]/40",
      label: "Abierto",
    },
    full: {
      bg: "bg-[var(--mhl-yellow)]/15 text-[var(--mhl-yellow)] border-[var(--mhl-yellow)]/40",
      label: "Cupos Agotados",
    },
    confirmed: { bg: "bg-blue-500/15 text-blue-400 border-blue-500/40", label: "Confirmado" },
    in_progress: { bg: "bg-purple-500/15 text-purple-400 border-purple-500/40", label: "En Juego" },
    completed: { bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40", label: "Finalizado" },
    cancelled: { bg: "bg-[var(--mhl-red)]/15 text-[var(--mhl-red)] border-[var(--mhl-red)]/40", label: "Cancelado" },
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-green)]">MHL</p>
      <h1 className="mt-2 text-4xl font-black uppercase tracking-[-0.04em]">Partidos</h1>

      {currentPlayer && (
        <section className="mt-8 space-y-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--mhl-green)]">Competencia</p>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Mis Convocatorias</h2>
            <p className="mt-1 text-xs text-[var(--mhl-muted)]">
              Cuando tu Coach te convoca a un partido oficial, confirmá o rechazá desde acá. En competencia la deuda pertenece al equipo, no al jugador.
            </p>
          </div>

          {invitations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-7 text-center text-sm text-[var(--mhl-muted)]">
              No tenés convocatorias de competencia registradas todavía.
            </div>
          ) : (
            <div className="space-y-4">
              {invitations.map(({ participation, match }) => {
                const home = match.home_team_id ? teamNames.get(match.home_team_id) ?? "Local" : "Local";
                const away = match.away_team_id ? teamNames.get(match.away_team_id) ?? "Visitante" : "Visitante";
                const status = participation.participation_status;
                const isReserved = status === "reserved";
                const isConfirmed = status === "confirmed";
                const isCancelled = status === "cancelled";
                const isPlayed = status === "played";
                const isNoShow = status === "no_show";

                return (
                  <article
                    key={participation.id}
                    className={`rounded-2xl border p-5 ${
                      isReserved
                        ? "border-[var(--mhl-yellow)]/60 bg-[var(--mhl-panel)]"
                        : isConfirmed
                          ? "border-[var(--mhl-green)]/60 bg-[var(--mhl-panel)]"
                          : "border-[var(--mhl-border)] bg-[var(--mhl-panel)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-2.5 py-1 text-[10px] font-black uppercase text-[var(--mhl-muted)]">
                          Partido oficial
                        </span>
                        {match.matchday && (
                          <span className="text-[10px] font-black uppercase text-[var(--mhl-muted)]">Fecha {match.matchday}</span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-[var(--mhl-muted)]">
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
                    </div>

                    <h3 className="mt-4 text-xl font-black uppercase tracking-tight">
                      {home} <span className="text-[var(--mhl-muted)]">vs</span> {away}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--mhl-muted)]">
                      {match.venue_name || "Lugar a designar"} {match.pitch ? `· Cancha ${match.pitch}` : ""}
                    </p>

                    <div className="mt-4 border-t border-[var(--mhl-border)]/60 pt-4">
                      {isReserved && (
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                          <span className="text-xs font-black uppercase tracking-wider text-[var(--mhl-yellow)]">CONVOCADO — respondé tu citación</span>
                          <div className="flex gap-2">
                            <form action={respondMatchParticipation}>
                              <input type="hidden" name="matchPlayerId" value={participation.id} />
                              <input type="hidden" name="decision" value="cancel" />
                              <button
                                type="submit"
                                className="rounded-xl border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-red)]"
                              >
                                Rechazar
                              </button>
                            </form>
                            <form action={respondMatchParticipation}>
                              <input type="hidden" name="matchPlayerId" value={participation.id} />
                              <input type="hidden" name="decision" value="confirm" />
                              <button
                                type="submit"
                                className="rounded-xl bg-[var(--mhl-green)] px-5 py-2 text-xs font-black uppercase tracking-wider text-[#080b0a]"
                              >
                                Confirmar
                              </button>
                            </form>
                          </div>
                        </div>
                      )}

                      {isConfirmed && (
                        <span className="text-xs font-black uppercase tracking-wider text-[var(--mhl-green)]">CONFIRMADO — estás en la convocatoria oficial</span>
                      )}
                      {isCancelled && (
                        <span className="text-xs font-black uppercase tracking-wider text-[var(--mhl-red)]">CONVOCATORIA RECHAZADA / CANCELADA</span>
                      )}
                      {isPlayed && <span className="text-xs font-black uppercase tracking-wider text-emerald-400">JUGASTE ESTE PARTIDO</span>}
                      {isNoShow && <span className="text-xs font-black uppercase tracking-wider text-[var(--mhl-red)]">AUSENTE</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="mt-12 space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--mhl-yellow)]">Convocatoria Abierta</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Próximos Amistosos</h2>
          <p className="mt-1 text-xs text-[var(--mhl-muted)]">
            Anotate individualmente a los partidos amistosos de la comunidad. Reservá tu lugar y luego confirmá tu asistencia.
          </p>
        </div>

        {friendlyMatches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-8 text-center text-sm text-[var(--mhl-muted)]">
            No hay partidos amistosos publicados en este momento. Volvé a consultar pronto.
          </div>
        ) : (
          <div className="space-y-4">
            {friendlyMatches.map((match) => {
              const activeCount = friendlyCountMap.get(match.id) ?? 0;
              const maxPlayers = match.max_players;
              const isFull = maxPlayers !== null && activeCount >= maxPlayers;
              const myParticipation = friendlyParticipationMap.get(match.id);
              const myStatus = myParticipation?.participation_status;
              const isReserved = myStatus === "reserved";
              const isConfirmed = myStatus === "confirmed";
              const canJoin = match.status === "open" && !isFull && !isReserved && !isConfirmed;
              const badge = statusStyles[match.status] ?? {
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
                        <span className={`rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${badge.bg}`}>{badge.label}</span>
                        <span className="rounded-md border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-2.5 py-1 text-[10px] font-bold uppercase text-[var(--mhl-muted)]">Amistoso</span>
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
                      <h3 className="text-xl font-black uppercase tracking-tight">{match.venue_name || "Predio a definir"}</h3>
                      <p className="mt-0.5 text-xs text-[var(--mhl-muted)]">{match.pitch ? `Cancha: ${match.pitch}` : "Cancha a designar"}</p>
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

                  <div className="border-t border-[var(--mhl-border)]/60 pt-4">
                    {!user ? (
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-xs text-[var(--mhl-muted)]">Iniciá sesión para anotarte a este partido.</p>
                        <Link href="/login" className="rounded-xl bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-black">Ingresar</Link>
                      </div>
                    ) : !currentPlayer ? (
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-xs text-[var(--mhl-muted)]">Tu cuenta no tiene un perfil de jugador vinculado para anotarse.</p>
                        <Link href="/mi-perfil" className="rounded-xl border border-[var(--mhl-green)]/50 bg-[var(--mhl-green)]/15 px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-green)]">Reclamar perfil &rarr;</Link>
                      </div>
                    ) : myParticipation && isReserved ? (
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <span className="text-xs font-black uppercase tracking-wider text-[var(--mhl-yellow)]">RESERVADO — Confirmá tu asistencia</span>
                        <div className="flex items-center gap-2">
                          <form action={respondMatchParticipation}>
                            <input type="hidden" name="matchPlayerId" value={myParticipation.id} />
                            <input type="hidden" name="decision" value="cancel" />
                            <button type="submit" className="rounded-xl border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-red)]">Cancelar</button>
                          </form>
                          <form action={respondMatchParticipation}>
                            <input type="hidden" name="matchPlayerId" value={myParticipation.id} />
                            <input type="hidden" name="decision" value="confirm" />
                            <button type="submit" className="rounded-xl bg-[var(--mhl-green)] px-5 py-2 text-xs font-black uppercase tracking-wider text-[#080b0a]">CONFIRMAR</button>
                          </form>
                        </div>
                      </div>
                    ) : myParticipation && isConfirmed ? (
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <span className="text-xs font-black uppercase tracking-wider text-[var(--mhl-green)]">CONFIRMADO — Estás en la lista oficial</span>
                        {(match.status === "open" || match.status === "full" || match.status === "confirmed") && (
                          <form action={respondMatchParticipation}>
                            <input type="hidden" name="matchPlayerId" value={myParticipation.id} />
                            <input type="hidden" name="decision" value="cancel" />
                            <button type="submit" className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-muted)]">Cancelar participación</button>
                          </form>
                        )}
                      </div>
                    ) : canJoin ? (
                      <form action={joinFriendlyMatch} className="flex justify-end">
                        <input type="hidden" name="matchId" value={match.id} />
                        <button type="submit" className="rounded-xl bg-[var(--mhl-green)] px-6 py-2.5 text-xs font-black uppercase tracking-wider text-[#080b0a]">ANOTARME</button>
                      </form>
                    ) : (
                      <p className="text-right text-xs font-bold uppercase tracking-wider text-[var(--mhl-muted)]">{isFull ? "Cupos agotados" : "Inscripción no disponible"}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {fixtureMatches.length > 0 && (
        <section className="mt-14 space-y-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--mhl-muted)]">Fixture de Liga</p>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Competencia Oficial</h2>
          </div>

          <div className="space-y-3">
            {fixtureMatches.map((match) => {
              const home = (match.home_team_id ? teamNames.get(match.home_team_id) : null) ?? match.home_team_placeholder ?? "A definir";
              const away = (match.away_team_id ? teamNames.get(match.away_team_id) : null) ?? match.away_team_placeholder ?? "A definir";
              return (
                <article key={match.id} className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
                  <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--mhl-muted)]">
                    <span>Fecha {match.matchday ?? "—"} {match.phase ? `· Fase ${match.phase}` : ""}</span>
                    <span>{match.status}</span>
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
