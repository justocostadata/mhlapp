"use client";

import { useActionState, useState } from "react";
import { login, signup, type AuthActionState } from "./actions";

const initialState: AuthActionState = {};

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const action = mode === "login" ? login : signup;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="w-full max-w-md rounded-3xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6 sm:p-8">
      <div className="mb-8">
        <p className="text-3xl font-black tracking-[-0.08em]">MHL.</p>
        <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-[var(--mhl-green)]">
          {mode === "login" ? "Ingresar" : "Crear cuenta"}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 rounded-xl border border-[var(--mhl-border)] p-1 text-xs font-black uppercase tracking-[0.1em]">
        <button onClick={() => setMode("login")} className={`rounded-lg px-3 py-2 ${mode === "login" ? "bg-white text-black" : "text-[var(--mhl-muted)]"}`}>Login</button>
        <button onClick={() => setMode("signup")} className={`rounded-lg px-3 py-2 ${mode === "signup" ? "bg-white text-black" : "text-[var(--mhl-muted)]"}`}>Registro</button>
      </div>

      <form action={formAction} className="space-y-4">
        {mode === "signup" && (
          <label className="block">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mhl-muted)]">Nombre completo</span>
            <input name="displayName" required className="w-full rounded-xl border border-[var(--mhl-border)] bg-[#090c0b] px-4 py-3 outline-none focus:border-[var(--mhl-green)]" />
          </label>
        )}
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mhl-muted)]">Email</span>
          <input name="email" type="email" required className="w-full rounded-xl border border-[var(--mhl-border)] bg-[#090c0b] px-4 py-3 outline-none focus:border-[var(--mhl-green)]" />
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mhl-muted)]">Contraseña</span>
          <input name="password" type="password" required minLength={6} className="w-full rounded-xl border border-[var(--mhl-border)] bg-[#090c0b] px-4 py-3 outline-none focus:border-[var(--mhl-green)]" />
        </label>

        {state.error && <p className="rounded-xl bg-[#ff645e17] px-4 py-3 text-sm text-[#ff9894]">{state.error}</p>}
        {state.message && <p className="rounded-xl bg-[#39d9a017] px-4 py-3 text-sm text-[#82e8c4]">{state.message}</p>}

        <button disabled={pending} className="w-full rounded-xl bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-black disabled:opacity-60">
          {pending ? "Procesando..." : mode === "login" ? "Ingresar" : "Crear cuenta"}
        </button>
      </form>
    </div>
  );
}
