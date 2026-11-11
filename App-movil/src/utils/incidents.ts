import { VET_SUGGESTION_MIN_INCIDENTS, VET_SUGGESTION_WINDOW_DAYS } from '@/constants/options';
import type { IncidentRow, IncidentType } from '@/types/database';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Tolerancia por relojes ligeramente adelantados. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export type VetSuggestion = {
  petId: string;
  tipo: IncidentType;
  count: number;
  lastAt: string;
};

/**
 * Regla: 3 incidentes del mismo tipo de una mascota en los últimos 7 días
 * sugieren llevarla al veterinario.
 */
export function getVetSuggestions(
  incidents: Pick<IncidentRow, 'mascota_id' | 'tipo' | 'ocurrido_en'>[],
  now: number,
  minIncidents = VET_SUGGESTION_MIN_INCIDENTS,
  windowDays = VET_SUGGESTION_WINDOW_DAYS,
) {
  const since = now - windowDays * DAY_MS;
  const groups = new Map<string, VetSuggestion>();

  for (const incident of incidents) {
    const at = Date.parse(incident.ocurrido_en);
    if (!Number.isFinite(at) || at < since || at > now + CLOCK_SKEW_MS) continue;
    const key = `${incident.mascota_id}|${incident.tipo}`;
    const current = groups.get(key) ?? { petId: incident.mascota_id, tipo: incident.tipo, count: 0, lastAt: incident.ocurrido_en };
    current.count += 1;
    if (Date.parse(incident.ocurrido_en) > Date.parse(current.lastAt)) current.lastAt = incident.ocurrido_en;
    groups.set(key, current);
  }

  return Array.from(groups.values())
    .filter((group) => group.count >= minIncidents)
    .sort((left, right) => right.count - left.count || Date.parse(right.lastAt) - Date.parse(left.lastAt));
}

export function getVetSuggestionWindowStart(now: number, windowDays = VET_SUGGESTION_WINDOW_DAYS) {
  return new Date(now - windowDays * DAY_MS).toISOString();
}
