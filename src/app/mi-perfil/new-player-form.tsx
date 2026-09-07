"use client";

import { useState } from "react";
import { requestNewPlayerRegistration } from "./actions";

export function NewPlayerForm() {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6 text-center">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-muted)]">
          ¿No encontrás tu perfil?
        </p>
        <p className="mt-2 text-sm text-[var(--mhl-muted)]">
          Si nunca jugaste en una edición anterior de MHL o no figurás en la lista histórica, podés solicitar tu alta como jugador nuevo.
        </p>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="mt-4 inline-flex items-center justify-center rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--mhl-text)] transition hover:border-[var(--mhl-green)] hover:text-[var(--mhl-green)]"
        >
          No encuentro mi perfil
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mhl-green)]">Alta deportiva</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Solicitar alta de jugador</h2>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs font-black uppercase tracking-wider text-[var(--mhl-muted)] hover:text-[var(--mhl-text)]"
        >
          Cerrar ✕
        </button>
      </div>

      <p className="mt-2 text-sm text-[var(--mhl-muted)]">
        Completá tus datos iniciales para que el Administrador de la liga apruebe tu incorporación.
      </p>

      <form action={requestNewPlayerRegistration} className="mt-6 space-y-4">
        <div>
          <label htmlFor="displayName" className="block text-xs font-black uppercase tracking-[0.12em] text-[var(--mhl-muted)]">
            Nombre y apellido <span className="text-[var(--mhl-red)]">*</span>
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            placeholder="Ej. Juan Pérez"
            className="mt-1.5 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-4 py-3 text-sm text-[var(--mhl-text)] placeholder:text-[var(--mhl-muted)] focus:border-[var(--mhl-green)] focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="position" className="block text-xs font-black uppercase tracking-[0.12em] text-[var(--mhl-muted)]">
            Posición <span className="text-[var(--mhl-red)]">*</span>
          </label>
          <select
            id="position"
            name="position"
            required
            defaultValue="Mid"
            className="mt-1.5 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-4 py-3 text-sm text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none"
          >
            <option value="GK">Arquero (GK)</option>
            <option value="Def">Defensor (Def)</option>
            <option value="Mid">Mediocampista (Mid)</option>
            <option value="Off">Delantero (Off)</option>
          </select>
        </div>

        <div>
          <label htmlFor="category" className="block text-xs font-black uppercase tracking-[0.12em] text-[var(--mhl-muted)]">
            Categoría <span className="text-[10px] font-normal text-[var(--mhl-muted)]">(Opcional)</span>
          </label>
          <input
            id="category"
            name="category"
            type="text"
            placeholder="Ej. Libre, Senior, etc."
            className="mt-1.5 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-4 py-3 text-sm text-[var(--mhl-text)] placeholder:text-[var(--mhl-muted)] focus:border-[var(--mhl-green)] focus:outline-none"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="w-full rounded-xl bg-[var(--mhl-green)] px-6 py-3.5 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110"
          >
            Solicitar alta
          </button>
        </div>
      </form>
    </div>
  );
}
