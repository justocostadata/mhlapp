import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TeamDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: team, error: teamError },
    { data: activeCoaches },
    { data: activeMembers },
  ] = await Promise.all([
    supabase.from("teams").select("id, name, short_name, active, logo_url").eq("id", id).single(),
    supabase.from("team_coaches").select("id, user_id, joined_at").eq("team_id", id).is("left_at", null),
    supabase.from("team_members").select("id, player_id, joined_at").eq("team_id", id).is("left_at", null),
  ]);

  if (teamError || !team) {
    notFound();
  }

  // Fetch coach profiles
  const coachUserIds = Array.from(new Set((activeCoaches ?? []).map((c) => c.user_id)));
  const { data: coachProfiles } = coachUserIds.length > 0
    ? await supabase.from("profiles").select("id, display_name").in("id", coachUserIds)
    : { data: [] };
  const coachProfilesMap = new Map((coachProfiles ?? []).map((p) => [p.id, p.display_name]));

  // Fetch roster player profiles
  const playerIds = Array.from(new Set((activeMembers ?? []).map((m) => m.player_id)));
  const { data: rosterPlayers } = playerIds.length > 0
    ? await supabase
        .from("players")
        .select("id, display_name, position, category, jersey_number")
        .in("id", playerIds)
        .order("jersey_number", { ascending: true, nullsFirst: false })
    : { data: [] };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link
        href="/equipos"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-muted)] hover:text-[var(--mhl-green)]"
      >
        &larr; Volver a Equipos
      </Link>

      <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-black uppercase tracking-[-0.04em]">{team.name}</h1>
            {team.short_name && (
              <span className="rounded-md border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-2.5 py-1 text-xs font-black uppercase tracking-wider text-[var(--mhl-muted)]">
                {team.short_name}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[var(--mhl-muted)]">
            Estado: <span className="text-[var(--mhl-green)]">{team.active ? "Activo en la liga" : "Inactivo"}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-4 py-3 text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--mhl-muted)]">Plantilla oficial</p>
          <p className="text-2xl font-black text-[var(--mhl-green)]">{activeMembers?.length ?? 0} jugadores</p>
        </div>
      </div>

      {/* CUERPO TÉCNICO */}
      <section className="mt-8 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mhl-muted)]">
          Cuerpo Técnico
        </p>
        {(activeCoaches ?? []).length === 0 ? (
          <p className="mt-2 text-sm italic text-[var(--mhl-muted)]">Sin directores técnicos asignados actualmente.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {(activeCoaches ?? []).map((c) => {
              const name = coachProfilesMap.get(c.user_id) || "Coach";
              return (
                <span
                  key={c.id}
                  className="inline-flex items-center rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3.5 py-2 text-xs font-black text-[var(--mhl-text)]"
                >
                  DT · {name}
                </span>
              );
            })}
          </div>
        )}
      </section>

      {/* PLANTILLA ACTIVA */}
      <section className="mt-8 space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-green)]">Plantilla activa</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Jugadores</h2>
        </div>

        {(rosterPlayers ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] p-8 text-center text-sm text-[var(--mhl-muted)]">
            Este equipo no tiene jugadores registrados en su plantilla activa.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(rosterPlayers ?? []).map((player) => (
              <article
                key={player.id}
                className="flex items-center justify-between rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-4 transition hover:border-[#3d4d44]"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-[var(--mhl-panel-2)] px-2 py-0.5 text-xs font-black text-[var(--mhl-green)]">
                      {player.jersey_number ? `#${player.jersey_number}` : "—"}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--mhl-muted)]">
                      {player.position ?? "Jugador"}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-black uppercase tracking-tight">
                    {player.display_name}
                  </h3>
                  <p className="text-[11px] text-[var(--mhl-muted)]">
                    Categoría: {player.category ?? "General"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
