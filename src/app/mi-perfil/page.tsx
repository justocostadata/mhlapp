import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  requestPlayerClaim,
  cancelPlayerClaim,
  cancelNewPlayerRegistration,
} from "./actions";
import { NewPlayerForm } from "./new-player-form";

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

  // 1. If player linked, check active team membership and teammates
  let activeTeam: { id: string; name: string; short_name: string | null } | null = null;
  let teammates: Array<{
    id: string;
    display_name: string;
    position: string | null;
    jersey_number: number | null;
  }> = [];

  if (player) {
    const { data: memberRecord } = await supabase
      .from("team_members")
      .select("id, team_id, joined_at")
      .eq("player_id", player.id)
      .is("left_at", null)
      .maybeSingle();

    if (memberRecord) {
      const [{ data: teamData }, { data: allMembers }] = await Promise.all([
        supabase
          .from("teams")
          .select("id, name, short_name")
          .eq("id", memberRecord.team_id)
          .single(),
        supabase
          .from("team_members")
          .select("player_id")
          .eq("team_id", memberRecord.team_id)
          .is("left_at", null),
      ]);

      activeTeam = teamData;

      const teammateIds = (allMembers ?? [])
        .map((m) => m.player_id)
        .filter((pid) => pid !== player.id);

      if (teammateIds.length > 0) {
        const { data: matesData } = await supabase
          .from("players")
          .select("id, display_name, position, jersey_number")
          .in("id", teammateIds)
          .order("display_name");

        teammates = matesData ?? [];
      }
    }
  }

  // 2. If no player linked, check for pending historical claim
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

  // 2. If no player and no pending claim, check for pending new player registration
  let pendingRegistration: {
    id: string;
    display_name: string;
    position: string;
    category: string | null;
    requested_at: string;
    status: string;
  } | null = null;

  if (!player && !pendingClaim) {
    const { data: reg } = await supabase
      .from("player_registration_requests")
      .select("id, display_name, position, category, requested_at, status")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (reg) {
      pendingRegistration = reg;
    }
  }

  // 3. Search logic if no player, no pending claim, and no pending registration
  const query = typeof resolvedParams.q === "string" ? resolvedParams.q.trim() : "";
  let searchResults: Array<{
    id: string;
    display_name: string;
    position: string | null;
    category: string | null;
  }> = [];

  if (!player && !pendingClaim && !pendingRegistration && query.length > 0) {
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

          {/* MI EQUIPO */}
          {activeTeam ? (
            <div className="mt-6 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--mhl-green)]">
                    Mi Equipo
                  </p>
                  <h3 className="mt-1 text-2xl font-black uppercase tracking-tight">
                    {activeTeam.name}
                  </h3>
                </div>
                {activeTeam.short_name && (
                  <span className="rounded-md border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-2.5 py-1 text-xs font-black uppercase tracking-wider text-[var(--mhl-muted)]">
                    {activeTeam.short_name}
                  </span>
                )}
              </div>

              <div className="mt-6 border-t border-[var(--mhl-border)]/60 pt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--mhl-muted)]">
                  Compañeros de equipo ({teammates.length})
                </p>

                {teammates.length === 0 ? (
                  <p className="mt-2 text-xs italic text-[var(--mhl-muted)]">
                    No hay otros compañeros asignados en la plantilla activa todavía.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {teammates.map((mate) => (
                      <div
                        key={mate.id}
                        className="flex items-center justify-between rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3.5 py-2.5 text-xs"
                      >
                        <span className="font-bold text-[var(--mhl-text)]">{mate.display_name}</span>
                        <div className="flex items-center gap-2 text-[var(--mhl-muted)]">
                          {mate.jersey_number !== null && (
                            <span className="font-bold text-[var(--mhl-green)]">#{mate.jersey_number}</span>
                          )}
                          <span>{mate.position ?? "Jugador"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-[var(--mhl-border)] p-6 text-center text-xs text-[var(--mhl-muted)]">
              Actualmente sos un <strong className="text-[var(--mhl-text)]">jugador libre</strong> (sin equipo asignado). Un Director Técnico puede solicitar tu incorporación a su franquicia.
            </div>
          )}
        </section>
      ) : pendingClaim ? (
        /* CASO 2: SOLICITUD HISTÓRICA PENDIENTE */
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
            Tu solicitud de vinculación está a la espera de aprobación por parte del Administrador.
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
      ) : pendingRegistration ? (
        /* CASO 3: SOLICITUD DE ALTA DE JUGADOR NUEVO PENDIENTE */
        <section className="mt-8 rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--mhl-yellow)]" />
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-yellow)]">
                Solicitud de alta pendiente
              </p>
            </div>
            <span className="text-xs text-[var(--mhl-muted)]">
              {new Date(pendingRegistration.requested_at).toLocaleDateString("es-AR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>

          <h2 className="mt-4 text-2xl font-black uppercase tracking-tight">
            {pendingRegistration.display_name}
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-4">
              <p className="text-xs text-[var(--mhl-muted)]">Posición</p>
              <p className="mt-1 font-black">{pendingRegistration.position}</p>
            </div>
            <div className="rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] p-4">
              <p className="text-xs text-[var(--mhl-muted)]">Categoría</p>
              <p className="mt-1 font-black">{pendingRegistration.category ?? "—"}</p>
            </div>
          </div>

          <p className="mt-4 text-xs text-[var(--mhl-muted)]">
            Tu solicitud de alta como nuevo jugador está a la espera de revisión y aprobación del Administrador.
          </p>

          <form action={cancelNewPlayerRegistration} className="mt-6">
            <input type="hidden" name="requestId" value={pendingRegistration.id} />
            <button
              type="submit"
              className="w-full rounded-xl border border-[var(--mhl-red)]/50 bg-[var(--mhl-red)]/10 px-5 py-3 text-xs font-black uppercase tracking-wider text-[var(--mhl-red)] transition hover:bg-[var(--mhl-red)]/20"
            >
              Cancelar solicitud
            </button>
          </form>
        </section>
      ) : (
        /* CASO 4: BUSCADOR DE HISTÓRICOS + FORMULARIO NUEVO JUGADOR */
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

          {/* ALTERNATIVA PARA JUGADORES NUEVOS */}
          <NewPlayerForm />
        </section>
      )}
    </main>
  );
}
