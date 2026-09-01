import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/stat-card";
import { approvePlayerClaim, rejectPlayerClaim } from "./actions";

export default async function AdminPage() {
  const { user, roles } = await requireRole("admin");
  const supabase = await createClient();

  const [players, teams, matches, claimsCountResult, rawClaimsResult] = await Promise.all([
    supabase.from("players").select("id", { count: "exact", head: true }),
    supabase.from("teams").select("id", { count: "exact", head: true }),
    supabase.from("matches").select("id", { count: "exact", head: true }),
    supabase.from("player_claims").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("player_claims")
      .select("id, player_id, user_id, requested_at, status, admin_notes")
      .eq("status", "pending")
      .order("requested_at", { ascending: false }),
  ]);

  const pendingClaimsList = rawClaimsResult.data ?? [];
  const playerIds = Array.from(new Set(pendingClaimsList.map((c) => c.player_id).filter(Boolean)));
  const userIds = Array.from(new Set(pendingClaimsList.map((c) => c.user_id).filter(Boolean)));

  const [{ data: playersData }, { data: profilesData }] = await Promise.all([
    playerIds.length > 0
      ? supabase.from("players").select("id, display_name, position, category").in("id", playerIds)
      : Promise.resolve({ data: [] }),
    userIds.length > 0
      ? supabase.from("profiles").select("id, display_name").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  const playersMap = new Map((playersData ?? []).map((p) => [p.id, p]));
  const profilesMap = new Map((profilesData ?? []).map((p) => [p.id, p]));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-red)]">Administrador</p>
      <h1 className="mt-2 text-4xl font-black uppercase tracking-[-0.04em]">Control MHL</h1>
      <p className="mt-3 text-sm text-[var(--mhl-muted)]">{user.email} · {roles.join(" · ")}</p>

      {/* DASHBOARD STATS */}
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Jugadores" value={players.count ?? "—"} />
        <StatCard label="Equipos" value={teams.count ?? "—"} />
        <StatCard label="Partidos" value={matches.count ?? "—"} />
        <StatCard label="Claims pendientes" value={claimsCountResult.count ?? "—"} />
      </div>

      {/* SOLICITUDES DE PERFIL */}
      <section className="mt-12">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-yellow)]">Gestión de usuarios</p>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Solicitudes de perfil</h2>
          </div>
          <span className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] px-3 py-1 text-xs font-black">
            {pendingClaimsList.length} {pendingClaimsList.length === 1 ? "pendiente" : "pendientes"}
          </span>
        </div>

        {pendingClaimsList.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[var(--mhl-border)] p-8 text-center text-sm text-[var(--mhl-muted)]">
            No hay solicitudes de vinculación pendientes en este momento.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {pendingClaimsList.map((claim) => {
              const claimedPlayer = playersMap.get(claim.player_id);
              const requesterProfile = profilesMap.get(claim.user_id);
              const requesterName = requesterProfile?.display_name || claim.user_id;

              return (
                <article
                  key={claim.id}
                  className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5 transition hover:border-[#45524c]"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[var(--mhl-yellow)]" />
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--mhl-yellow)]">
                          Pendiente
                        </p>
                        <span className="text-xs text-[var(--mhl-muted)]">·</span>
                        <span className="text-xs text-[var(--mhl-muted)]">
                          {new Date(claim.requested_at).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      <h3 className="text-xl font-black uppercase tracking-tight">
                        {claimedPlayer?.display_name ?? "Jugador desconocido"}
                      </h3>

                      <p className="text-xs text-[var(--mhl-muted)]">
                        {claimedPlayer?.position ?? "Sin posición"} · {claimedPlayer?.category ?? "Sin categoría"}
                      </p>

                      <p className="pt-2 text-xs text-[var(--mhl-muted)]">
                        Solicitado por: <span className="font-bold text-[var(--mhl-text)]">{requesterName}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 sm:self-center">
                      <form action={rejectPlayerClaim}>
                        <input type="hidden" name="claimId" value={claim.id} />
                        <button
                          type="submit"
                          className="rounded-xl border border-[var(--mhl-red)]/40 bg-[var(--mhl-red)]/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--mhl-red)] transition hover:bg-[var(--mhl-red)]/20"
                        >
                          Rechazar
                        </button>
                      </form>

                      <form action={approvePlayerClaim}>
                        <input type="hidden" name="claimId" value={claim.id} />
                        <button
                          type="submit"
                          className="rounded-xl bg-[var(--mhl-green)] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
                        >
                          Aprobar
                        </button>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
