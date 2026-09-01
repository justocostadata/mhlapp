import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function MyProfilePage() {
  const { user, roles } = await requireUser();
  const supabase = await createClient();

  const [{ data: profile }, { data: player }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url, status").eq("id", user.id).maybeSingle(),
    supabase.from("players").select("id, display_name, position, category, status, legacy_id").eq("user_id", user.id).maybeSingle(),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-green)]">Mi perfil</p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.04em]">{player?.display_name ?? profile?.display_name ?? user.email}</h1>
      <p className="mt-3 text-sm text-[var(--mhl-muted)]">Roles: {roles.join(" · ") || "sin rol"}</p>

      {player ? (
        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5"><p className="text-xs text-[var(--mhl-muted)]">Posición</p><p className="mt-2 font-black">{player.position ?? "—"}</p></div>
          <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5"><p className="text-xs text-[var(--mhl-muted)]">Categoría</p><p className="mt-2 font-black">{player.category ?? "—"}</p></div>
          <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5"><p className="text-xs text-[var(--mhl-muted)]">Estado</p><p className="mt-2 font-black uppercase">{player.status}</p></div>
        </section>
      ) : (
        <section className="mt-8 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
          <p className="text-lg font-black">Todavía no vinculaste tu perfil deportivo.</p>
          <p className="mt-2 text-sm leading-6 text-[var(--mhl-muted)]">El próximo slice permitirá buscar entre los jugadores históricos y solicitar al Admin que vincule tu cuenta.</p>
        </section>
      )}
    </main>
  );
}
