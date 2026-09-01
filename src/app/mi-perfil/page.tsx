import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requestPlayerClaim, cancelPlayerClaim } from "./actions";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function MyProfilePage({ searchParams }: PageProps) {
  const { user, roles } = await requireUser();
  const resolvedParams = await searchParams;
  const supabase = await createClient();

  const [{ data: profile }, { data: player }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url, status").eq("id", user.id).maybeSingle(),
    supabase.from("players").select("id, display_name, position, category, status, jersey_number, legacy_id").eq("user_id", user.id).maybeSingle(),
  ]);

  // If no player linked, check for pending claim
  let pendingClaim: {
    id: string;
    requested_at: string;
    status: string;
    player_id: string;
  } | null = null;
  let claimedPlayer: {
    id: string;
    display_name: string;
    position: string | null;
    category: string | null;
  } | null = null;

  if (!player) {
    const { data: claim } = await supabase
      .from("player_claims")
      .select("id, requested_at, status, player_id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (claim) {
      pendingClaim = claim;
      const { data: cp } = await supabase
        .from("players")
        .select("id, display_name, position, category")
        .eq("id", claim.player_id)
        .maybeSingle();
      claimedPlayer = cp;
    }
  }

  // Search logic if no player and no pending claim
  const query = typeof resolvedParams.q === "string" ? resolvedParams.q.trim() : "";
  let searchResults: Array<{
    id: string;
    display_name: string;
    position: string | null;
    category: string | null;
  }> = [];

  if (!player && !pendingClaim && query.length > 0) {
    const { data: results } = await supabase
      .from("players")
      .select("id, display_name, position, category")
      .is("user_id", null)
      .ilike("display_name", `%${query}%`)
      .order("display_name")
      .limit(20);

    searchResults = results ?? [];
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-green)]">Mi perfil</p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.04em]">
        {player?.display_name ?? profile?.display_name ?? user.email}
      </h1>
      <p className="mt-3 text-sm text-[var(--mhl-muted)]">Roles: {roles.join(" · ") || "sin rol"}</p>

      {/* CASO 1: PERFIL VINCULADO */}
      {player ? (
        <section className="mt-8">
          <div className="flex items-center gap-2 rounded-xl border border-[var(--mhl-green)]/30 bg-[var(--mhl-green)]/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--mhl-green)]">
            <span className="h-2 w-2 rounded-full bg-[var(--mhl-green)]" />
            Perfil deportivo vinculado
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
              <p className="text-xs text-[var(--mhl-muted)]">Posición</p>
              <p className="mt-2 font-black">{player.position ?? "—"}</p>
            </div>
            <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
              <p className="text-xs text-[var(--mhl-muted)]">Categoría</p>
              <p className="mt-2 font-black">{player.category ?? "—"}</p>
            </div>
            <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
              <p className="text-xs text-[var(--mhl-muted)]">Estado</p>
              <p className="mt-2 font-black uppercase">{player.status}</p>
            </div>
          </div>

          {player.jersey_number !== null && player.jersey_number !== undefined && (
            <div className="mt-3 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
              <p className="text-xs text-[var(--mhl-muted)]">Dorsal</p>
              <p className="mt-2 text-2xl font-black">#{player.jersey_number}</p>
            </div>
          )}
        </section>
      ) : pendingClaim ? (
        /* CASO 2: SOLICITUD PENDIENTE */
        <section className="mt-8 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--mhl-yellow)]" />
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-yellow)]">
                Solicitud pendiente
              </p>
            </div>
            <span className="text-xs text-[var(--mhl-muted)]">
              {new Date(pendingClaim.requested_at).toLocaleDateString("es-AR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>

          <h2 className="mt-4 text-2xl font-black uppercase tracking-tight">
            {claimedPlayer?.display_name ?? "Jugador solicitado"}
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-4">
              <p className="text-xs text-[var(--mhl-muted)]">Posición</p>
              <p className="mt-1 font-black">{claimedPlayer?.position ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-4">
              <p className="text-xs text-[var(--mhl-muted)]">Categoría</p>
              <p className="mt-1 font-black">{claimedPlayer?.category ?? "—"}</p>
            </div>
          </div>

          <p className="mt-4 text-xs text-[var(--mhl-muted)]">
            Tu solicitud está a la espera de aprobación por parte del Administrador.
          </p>

          <form action={cancelPlayerClaim} className="mt-6">
            <input type="hidden" name="claimId" value={pendingClaim.id} />
            <button
              type="submit"
              className="w-full rounded-xl border border-[var(--mhl-red)]/50 bg-[var(--mhl-red)]/10 px-5 py-3 text-xs font-black uppercase tracking-wider text-[var(--mhl-red)] transition hover:bg-[var(--mhl-red)]/20"
            >
              Cancelar solicitud
            </button>
          </form>
        </section>
      ) : (
        /* CASO 3: BUSCADOR DE JUGADORES */
        <section className="mt-8 space-y-6">
          <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-muted)]">Vinculación deportiva</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight">Encontrá tu perfil de jugador</h2>
            <p className="mt-2 text-sm text-[var(--mhl-muted)]">
              Buscá tu nombre en la base histórica de Master Hood League para solicitar la vinculación a tu cuenta.
            </p>

            <form method="GET" action="/mi-perfil" className="mt-6 flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Buscar por nombre o apellido..."
                className="flex-1 rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-4 py-3 text-sm text-[var(--mhl-text)] placeholder:text-[var(--mhl-muted)] focus:border-[var(--mhl-green)] focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-xl bg-[var(--mhl-green)] px-6 py-3 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
              >
                Buscar
              </button>
            </form>
          </div>

          {query.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--mhl-muted)]">
                Resultados para &ldquo;{query}&rdquo; ({searchResults.length})
              </p>

              {searchResults.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] p-6 text-center text-sm text-[var(--mhl-muted)]">
                  No se encontraron jugadores disponibles con ese nombre.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {searchResults.map((p) => (
                    <article
                      key={p.id}
                      className="flex flex-col justify-between rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5"
                    >
                      <div>
                        <h3 className="font-black uppercase tracking-tight">{p.display_name}</h3>
                        <p className="mt-1 text-xs text-[var(--mhl-muted)]">
                          {p.position ?? "Sin posición"} · {p.category ?? "Sin categoría"}
                        </p>
                      </div>

                      <form action={requestPlayerClaim} className="mt-5">
                        <input type="hidden" name="playerId" value={p.id} />
                        <button
                          type="submit"
                          className="w-full rounded-xl border border-[var(--mhl-green)]/40 bg-[var(--mhl-green)]/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--mhl-green)] transition hover:bg-[var(--mhl-green)]/20"
                        >
                          Este soy yo
                        </button>
                      </form>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
