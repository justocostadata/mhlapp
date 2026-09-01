import { createClient } from "@/lib/supabase/server";

export default async function PlayersPage() {
  const supabase = await createClient();
  const { data: players, error } = await supabase
    .from("players")
    .select("id, display_name, position, status, jersey_number")
    .order("display_name")
    .limit(100);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-green)]">MHL</p>
      <h1 className="mt-2 text-4xl font-black uppercase tracking-[-0.04em]">Jugadores</h1>
      {error ? <p className="mt-6 text-[var(--mhl-red)]">{error.message}</p> : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(players ?? []).map((player) => (
            <article key={player.id} className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div><h2 className="font-black uppercase tracking-tight">{player.display_name}</h2><p className="mt-1 text-xs text-[var(--mhl-muted)]">{player.position ?? "Sin posición"}</p></div>
                {player.jersey_number !== null && <span className="text-xl font-black text-[var(--mhl-muted)]">#{player.jersey_number}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
