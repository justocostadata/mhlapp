"use client";

import { useMemo, useState } from "react";
import { createCompetitionMatch } from "./actions";

type CompetitionOption = {
  id: string;
  name: string;
  status: string;
};

type TeamOption = {
  id: string;
  name: string;
  short_name: string | null;
};

type CompetitionTeamLink = {
  competition_id: string;
  team_id: string;
};

type Props = {
  competitions: CompetitionOption[];
  teams: TeamOption[];
  competitionTeams: CompetitionTeamLink[];
};

export function CompetitionMatchForm({ competitions, teams, competitionTeams }: Props) {
  const [competitionId, setCompetitionId] = useState("");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");

  const availableTeams = useMemo(() => {
    if (!competitionId) return [];

    const linkedIds = new Set(
      competitionTeams
        .filter((link) => link.competition_id === competitionId)
        .map((link) => link.team_id)
    );

    return teams
      .filter((team) => linkedIds.has(team.id))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [competitionId, competitionTeams, teams]);

  function handleCompetitionChange(nextCompetitionId: string) {
    setCompetitionId(nextCompetitionId);
    setHomeTeamId("");
    setAwayTeamId("");
  }

  function handleHomeTeamChange(nextHomeTeamId: string) {
    setHomeTeamId(nextHomeTeamId);
    if (awayTeamId === nextHomeTeamId) {
      setAwayTeamId("");
    }
  }

  function handleAwayTeamChange(nextAwayTeamId: string) {
    setAwayTeamId(nextAwayTeamId);
    if (homeTeamId === nextAwayTeamId) {
      setHomeTeamId("");
    }
  }

  const selectedCompetition = competitions.find((competition) => competition.id === competitionId);
  const hasTeams = availableTeams.length > 0;

  return (
    <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-6">
      <h3 className="text-lg font-black uppercase tracking-tight">Crear partido de competencia</h3>
      <p className="mt-1 text-xs text-[var(--mhl-muted)]">
        Elegí una competencia y después los equipos que participan. El cobro del partido pertenece a cada equipo.
      </p>

      <form action={createCompetitionMatch} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Competencia</label>
          <select
            name="competition_id"
            value={competitionId}
            onChange={(event) => handleCompetitionChange(event.target.value)}
            required
            className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none"
          >
            <option value="" disabled>
              Seleccionar competencia...
            </option>
            {competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>
                {competition.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Equipo local</label>
          <select
            name="home_team_id"
            value={homeTeamId}
            onChange={(event) => handleHomeTeamChange(event.target.value)}
            required
            disabled={!competitionId || !hasTeams}
            className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              {competitionId ? "Seleccionar local..." : "Primero elegí una competencia"}
            </option>
            {availableTeams
              .filter((team) => team.id !== awayTeamId)
              .map((team) => (
                <option key={`home-${team.id}`} value={team.id}>
                  {team.name}{team.short_name ? ` (${team.short_name})` : ""}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Equipo visitante</label>
          <select
            name="away_team_id"
            value={awayTeamId}
            onChange={(event) => handleAwayTeamChange(event.target.value)}
            required
            disabled={!competitionId || !hasTeams}
            className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              {competitionId ? "Seleccionar visitante..." : "Primero elegí una competencia"}
            </option>
            {availableTeams
              .filter((team) => team.id !== homeTeamId)
              .map((team) => (
                <option key={`away-${team.id}`} value={team.id}>
                  {team.name}{team.short_name ? ` (${team.short_name})` : ""}
                </option>
              ))}
          </select>
        </div>

        {competitionId && !hasTeams && (
          <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-[var(--mhl-yellow)]/30 bg-[var(--mhl-yellow)]/10 px-4 py-3 text-xs text-[var(--mhl-yellow)]">
            {selectedCompetition?.name ?? "La competencia seleccionada"} no tiene equipos vinculados.
          </div>
        )}

        <div>
          <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Fecha</label>
          <input
            type="date"
            name="date"
            required
            className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Hora</label>
          <input
            type="time"
            name="time"
            required
            className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Precio por equipo ($)</label>
          <input
            type="number"
            name="team_price"
            placeholder="Ej. 100000"
            min="0"
            step="any"
            required
            className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] focus:border-[var(--mhl-green)] focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Predio</label>
          <input
            type="text"
            name="venue_name"
            placeholder="Ej. Rock and Gol"
            className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:border-[var(--mhl-green)] focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Cancha</label>
          <input
            type="text"
            name="pitch"
            placeholder="Ej. Cancha 1"
            className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:border-[var(--mhl-green)] focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Jornada / Fecha # (opcional)</label>
          <input
            type="number"
            name="matchday"
            placeholder="Ej. 1"
            min="1"
            className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:border-[var(--mhl-green)] focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Fase (opcional)</label>
          <input
            type="text"
            name="phase"
            placeholder="Ej. Grupos / Semifinal / Final"
            className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:border-[var(--mhl-green)] focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Zona (opcional)</label>
          <input
            type="text"
            name="zone"
            placeholder="Ej. Zona A"
            className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:border-[var(--mhl-green)] focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-wider text-[var(--mhl-muted)]">Número de partido (opcional)</label>
          <input
            type="number"
            name="match_number"
            placeholder="Ej. 101"
            min="1"
            className="mt-1 w-full rounded-xl border border-[var(--mhl-border)] bg-[var(--mhl-panel-2)] px-3 py-2 text-xs text-[var(--mhl-text)] placeholder-[var(--mhl-muted)] focus:border-[var(--mhl-green)] focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            disabled={!competitionId || !homeTeamId || !awayTeamId || homeTeamId === awayTeamId || !hasTeams}
            className="rounded-xl bg-[var(--mhl-yellow)] px-6 py-2.5 text-xs font-black uppercase tracking-wider text-[#080b0a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Crear partido competitivo (Draft)
          </button>
        </div>
      </form>
    </div>
  );
}
