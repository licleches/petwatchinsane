import { getIncidents } from '@/services/incidents';
import { getPets } from '@/services/pets';
import { getTasksInRange } from '@/services/tasks';
import { getVaccinesForPets } from '@/services/vaccines';
import { getVisitsForPets } from '@/services/vetVisits';
import { getWalks } from '@/services/walks';
import type { PetRow } from '@/types/database';
import { addDays, dateForTimeZone } from '@/utils/dates';
import type { HistoryData, HistoryKind } from '@/utils/history';

export type HistoryFilter = HistoryKind | 'todo';

/**
 * Datos del historial del hogar de los últimos `days` días. Solo consulta los
 * tipos que se van a mostrar.
 */
export async function getHistory(
  householdId: string,
  { todayKey, timeZone, days, kind, nowIso }: { todayKey: string; timeZone: string; days: number; kind: HistoryFilter; nowIso: string },
): Promise<HistoryData & { pets: PetRow[] }> {
  const sinceDate = addDays(todayKey, -(days - 1));
  const sinceIso = dateForTimeZone(sinceDate, '00:00', timeZone).toISOString();
  const wants = (target: HistoryKind) => kind === 'todo' || kind === target;

  const pets = await getPets(householdId);
  const petIds = pets.map((pet) => pet.id);

  const [tasks, incidents, walks, vaccines, visits] = await Promise.all([
    wants('tarea') ? getTasksInRange([householdId], sinceIso, nowIso) : [],
    wants('incidente') ? getIncidents(householdId, { sinceIso }) : [],
    wants('paseo') ? getWalks(householdId, { sinceIso }) : [],
    wants('vacuna') ? getVaccinesForPets(petIds, { sinceDate, untilDate: todayKey }) : [],
    wants('visita') ? getVisitsForPets(petIds, { sinceDate, untilDate: todayKey }) : [],
  ]);

  return { pets, tasks, incidents, walks, vaccines, visits };
}
