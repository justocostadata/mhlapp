import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/stat-card";

export default async function HomePage() {
  const supabase = await createClient();

  const [playersResult, teamsResult, matchesResult] = await Promise.all([
    supabase.from("players").select("id", { count: "exact", head: true }),
    supabase.from("teams").select("id", { count: "exact", head: true }),
    supabase.from("matches").select("id", { count: "exact", head: true }),
  ]);

  const connected = !playersResult.error && !teamsResult.error && !matchesResult.error;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
      <section className="grid gap-8 lg:grid-cols-[1.35fr_.65fr] lg:items-end">
        <div>
          <p className="mb-4 text-xs font-black uppercase tracking-[0.25em] text-[var(--mhl-green)]">MHLApp · MVP Competencia</p>
          <h1 className="max-w-3xl text-5xl font-black uppercase leading-[.92] tracking-[-0.055em] sm:text-7xl">
            La liga empieza en el partido.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--mhl-muted)] sm:text-lg">
            Jugadores, coaches, planilleros y administración conectados sobre una única base deportiva de Master Hood League.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-black uppercase tracking-[0.15em]">Supabase MHL</span>
            <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-[var(--mhl-green)]" : "bg-[var(--mhl-red)]"}`} />
          </div>
          <p className="mt-3 text-sm text-[var(--mhl-muted)]">
            {connected ? "Frontend conectado a la base nueva." : "Configurá .env.local para conectar la base."}
          </p>
        </div>
      </section>

      <section className="mt-12 grid grid-cols-3 gap-3">
        <StatCard label="Jugadores" value={playersResult.count ?? "—"} />
        <StatCard label="Equipos" value={teamsResult.count ?? "—"} />
        <StatCard label="Partidos" value={matchesResult.count ?? "—"} />
      </section>

      <section className="mt-10 grid gap-3 sm:grid-cols-3">
        {[
          ["Partidos", "/partidos", "Fixture, amistosos y resultados."],
          ["Equipos", "/equipos", "Planteles y estructura deportiva."],
          ["Jugadores", "/jugadores", "Perfiles e historia MHL."],
        ].map(([title, href, description]) => (
          <Link key={href} href={href} className="group rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5 transition hover:-translate-y-0.5 hover:border-[#45524c]">
            <p className="text-lg font-black uppercase tracking-tight">{title}</p>
            <p className="mt-2 text-sm text-[var(--mhl-muted)]">{description}</p>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.12em] text-[var(--mhl-green)]">Abrir →</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
