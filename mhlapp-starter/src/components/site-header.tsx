import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { signOut } from "@/app/actions";

export async function SiteHeader() {
  const { user, roles } = await getAuthContext();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--mhl-border)] bg-[#080b0ae8] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="text-xl font-black tracking-[-0.08em]">MHL.</span>
          <span className="hidden text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--mhl-muted)] sm:block">
            Master Hood League
          </span>
        </Link>

        <nav className="hidden items-center gap-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--mhl-muted)] md:flex">
          <Link className="hover:text-white" href="/partidos">Partidos</Link>
          <Link className="hover:text-white" href="/equipos">Equipos</Link>
          <Link className="hover:text-white" href="/jugadores">Jugadores</Link>
          {roles.includes("admin") && <Link className="text-[var(--mhl-red)]" href="/admin">Admin</Link>}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link href="/mi-perfil" className="rounded-full border border-[var(--mhl-border)] px-3 py-2 text-xs font-bold">
                Mi perfil
              </Link>
              <form action={signOut}>
                <button className="rounded-full px-3 py-2 text-xs text-[var(--mhl-muted)] hover:text-white">Salir</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-black">
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
