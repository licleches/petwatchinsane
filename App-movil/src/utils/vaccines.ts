import { VACCINE_UPCOMING_DAYS } from '@/constants/options';
import type { VaccineRow } from '@/types/database';
import { diffInDays } from '@/utils/dates';

/**
 * vencida / proxima / al_dia: según la próxima dosis de la aplicación más reciente.
 * sin_refuerzo: la última aplicación no tiene próxima dosis.
 * historial: hay una aplicación más reciente de la misma vacuna.
 */
export type VaccineStatus = 'vencida' | 'proxima' | 'al_dia' | 'sin_refuerzo' | 'historial';
export type VaccineStatusInfo = { status: VaccineStatus; daysUntil: number | null };

const STATUS_ORDER: Record<VaccineStatus, number> = { vencida: 0, proxima: 1, al_dia: 2, sin_refuerzo: 3, historial: 4 };

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getVaccineStatuses(
  vaccines: Pick<VaccineRow, 'id' | 'nombre' | 'aplicada_en' | 'proxima_en' | 'creado_en'>[],
  todayKey: string,
  upcomingDays = VACCINE_UPCOMING_DAYS,
) {
  const latestByName = new Map<string, (typeof vaccines)[number]>();
  for (const vaccine of vaccines) {
    const key = normalizeName(vaccine.nombre);
    const current = latestByName.get(key);
    if (
      !current ||
      vaccine.aplicada_en > current.aplicada_en ||
      (vaccine.aplicada_en === current.aplicada_en && vaccine.creado_en > current.creado_en)
    ) {
      latestByName.set(key, vaccine);
    }
  }

  const statuses = new Map<string, VaccineStatusInfo>();
  for (const vaccine of vaccines) {
    if (latestByName.get(normalizeName(vaccine.nombre))?.id !== vaccine.id) {
      statuses.set(vaccine.id, { status: 'historial', daysUntil: null });
    } else if (!vaccine.proxima_en) {
      statuses.set(vaccine.id, { status: 'sin_refuerzo', daysUntil: null });
    } else {
      const daysUntil = diffInDays(todayKey, vaccine.proxima_en);
      statuses.set(vaccine.id, {
        status: daysUntil < 0 ? 'vencida' : daysUntil <= upcomingDays ? 'proxima' : 'al_dia',
        daysUntil,
      });
    }
  }
  return statuses;
}

export function sortVaccinesByStatus<T extends Pick<VaccineRow, 'id' | 'aplicada_en' | 'proxima_en'>>(
  vaccines: T[],
  statuses: Map<string, VaccineStatusInfo>,
) {
  return [...vaccines].sort((left, right) => {
    const leftStatus = statuses.get(left.id)?.status ?? 'historial';
    const rightStatus = statuses.get(right.id)?.status ?? 'historial';
    if (leftStatus !== rightStatus) return STATUS_ORDER[leftStatus] - STATUS_ORDER[rightStatus];
    if (left.proxima_en && right.proxima_en && left.proxima_en !== right.proxima_en) {
      return left.proxima_en.localeCompare(right.proxima_en);
    }
    return right.aplicada_en.localeCompare(left.aplicada_en);
  });
}
