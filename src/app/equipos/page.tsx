import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function TeamsPage() {
  const supabase = await createClient();

  const [
    { data: teams, error },
    { data: activeCoaches },
    { data: activeMembers },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("teams").select("id, name, short_name, active, logo_url").order("name"),
    supabase.from("team_coaches").select("id, team_id, user_id").is("left_at", null),
    supabase.from("team_members").select("id, team_id, player_id").is("left_at", null),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const profilesMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  // Map active coaches by team
  const coachesByTeam = new Map<string, string[]>();
  for (const c of activeCoaches ?? []) {
    const list = coachesByTeam.get(c.team_id) ?? [];
    const name = profilesMap.get(c.user_id) || "Coach";
    list.push(name);
    coachesByTeam.set(c.team_id, list);
  }

  // Count active players by team
  const memberCountByTeam = new Map<string, number>();
  for (const m of activeMembers ?? []) {
    memberCountByTeam.set(m.team_id, (memberCountByTeam.get(m.team_id) ?? 0) + 1);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-green)]">MHL</p>
      <h1 className="mt-2 text-4xl font-black uppercase tracking-[-0.04em]">Equipos</h1>
      <p className="mt-2 text-sm text-[var(--mhl-muted)]">
        Franquicias oficiales, cuerpos técnicos y plantillas activas de la liga.
      </p>

      {error ? (
        <p className="mt-6 text-[var(--mhl-red)]">{error.message}</p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(teams ?? []).map((team) => {
            const coaches = coachesByTeam.get(team.id) ?? [];
            const playersCount = memberCountByTeam.get(team.id) ?? 0;

            return (
              <Link
                key={team.id}
                href={`/equipos/${team.id}`}
                className="group flex flex-col justify-between rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6 transition hover:border-[var(--mhl-green)]/60 hover:bg-[var(--mhl-panel-2)]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mhl-muted)]">
                      Franquicia
                    </p>
                    {team.short_name && (
                      <span className="rounded-md border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">
                        {team.short_name}
                      </span>
                    )}
                  </div>

                  <h2 className="mt-3 text-2xl font-black uppercase tracking-tight text-[var(--mhl-text)] group-hover:text-[var(--mhl-green)]">
                    {team.name}
                  </h2>

                  {/* Coaches */}
                  <div className="mt-4 border-t border-[var(--mhl-border)]/60 pt-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--mhl-muted)]">
                      Director Técnico
                    </p>
                    <p className="mt-1 text-xs font-bold text-[var(--mhl-text)]">
                      {coaches.length > 0 ? coaches.join(", ") : "Sin coach asignado"}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-[var(--mhl-border)]/60 pt-3 text-xs">
                  <span className="text-[var(--mhl-muted)]">
                    Plantilla: <strong className="text-[var(--mhl-text)]">{playersCount} jugadores</strong>
                  </span>
                  <span className="font-bold text-[var(--mhl-green)] group-hover:underline">
                    Ver plantilla &rarr;
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
