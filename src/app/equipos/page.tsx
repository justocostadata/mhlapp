import { createClient } from "@/lib/supabase/server";

export default async function TeamsPage() {
  const supabase = await createClient();
  const { data: teams, error } = await supabase.from("teams").select("id, name, short_name, active").order("name");

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-green)]">MHL</p>
      <h1 className="mt-2 text-4xl font-black uppercase tracking-[-0.04em]">Equipos</h1>
      {error ? <p className="mt-6 text-[var(--mhl-red)]">{error.message}</p> : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(teams ?? []).map((team) => (
            <article key={team.id} className="min-h-40 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--mhl-muted)]">Franquicia</p>
              <h2 className="mt-3 text-xl font-black uppercase tracking-tight">{team.name}</h2>
              <p className="mt-8 text-xs text-[var(--mhl-muted)]">{team.active ? "Activo" : "Inactivo"}</p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
