import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/stat-card";

export default async function AdminPage() {
  const { user, roles } = await requireRole("admin");
  const supabase = await createClient();

  const [players, teams, matches, claims] = await Promise.all([
    supabase.from("players").select("id", { count: "exact", head: true }),
    supabase.from("teams").select("id", { count: "exact", head: true }),
    supabase.from("matches").select("id", { count: "exact", head: true }),
    supabase.from("player_claims").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-red)]">Administrador</p>
      <h1 className="mt-2 text-4xl font-black uppercase tracking-[-0.04em]">Control MHL</h1>
      <p className="mt-3 text-sm text-[var(--mhl-muted)]">{user.email} · {roles.join(" · ")}</p>
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Jugadores" value={players.count ?? "—"} />
        <StatCard label="Equipos" value={teams.count ?? "—"} />
        <StatCard label="Partidos" value={matches.count ?? "—"} />
        <StatCard label="Claims pendientes" value={claims.count ?? "—"} />
      </div>
      <div className="mt-8 rounded-2xl border border-dashed border-[var(--mhl-border)] p-6 text-sm text-[var(--mhl-muted)]">
        Próximo slice: aprobar perfiles, gestionar equipos y construir el motor de partidos. No se agregan features fuera de PROJECT_BIBLE.md.
      </div>
    </main>
  );
}
