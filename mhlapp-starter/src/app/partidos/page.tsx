import { createClient } from "@/lib/supabase/server";

export default async function MatchesPage() {
  const supabase = await createClient();

  const [{ data: matches, error }, { data: teams }] = await Promise.all([
    supabase
      .from("matches")
      .select("id, legacy_id, matchday, phase, zone, status, home_score, away_score, home_team_id, away_team_id, home_team_placeholder, away_team_placeholder")
      .order("matchday", { ascending: false, nullsFirst: false })
      .limit(40),
    supabase.from("teams").select("id, name"),
  ]);

  const teamNames = new Map((teams ?? []).map((team) => [team.id, team.name]));

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-green)]">MHL</p>
      <h1 className="mt-2 text-4xl font-black uppercase tracking-[-0.04em]">Partidos</h1>
      {error ? <p className="mt-6 text-[var(--mhl-red)]">{error.message}</p> : (
        <div className="mt-8 space-y-3">
          {(matches ?? []).map((match) => {
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
      )}
    </main>
  );
}
