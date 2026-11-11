import type { TaskRow } from '@/types/database';
import { weekdayNames, weekdayShortNames } from '@/utils/dates';

/** Orden de la semana para mostrar: lunes primero. */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS = [1, 2, 3, 4, 5];
export const WEEKEND = [0, 6];

function sameDays(left: number[], right: number[]) {
  return left.length === right.length && left.every((day) => right.includes(day));
}

export function sortDays(days: number[]) {
  return Array.from(new Set(days)).sort((left, right) => left - right);
}

export function formatWeekdays(days: number[]) {
  const unique = sortDays(days);
  if (sameDays(unique, ALL_DAYS)) return 'Todos los días';
  if (sameDays(unique, WEEKDAYS)) return 'Lunes a viernes';
  if (sameDays(unique, WEEKEND)) return 'Fines de semana';
  if (unique.length === 1) return `Cada ${weekdayNames[unique[0]]}`;
  return WEEKDAY_DISPLAY_ORDER.filter((day) => unique.includes(day))
    .map((day) => weekdayShortNames[day])
    .join(', ');
}

export function isSameDaySet(left: number[], right: number[]) {
  return sameDays(sortDays(left), sortDays(right));
}

/** Momento en que la tarea vuelve a estar pendiente (si se pospuso, la nueva hora). */
export function getTaskEffectiveTime(task: Pick<TaskRow, 'estado' | 'programada_para' | 'pospuesta_hasta'>) {
  if (task.estado === 'pospuesta' && task.pospuesta_hasta) {
    const postponed = Date.parse(task.pospuesta_hasta);
    if (Number.isFinite(postponed)) return postponed;
  }
  return Date.parse(task.programada_para);
}

export function isTaskActionable(task: Pick<TaskRow, 'estado'>) {
  return task.estado === 'pendiente' || task.estado === 'pospuesta';
}

export function isTaskOverdue(task: Pick<TaskRow, 'estado' | 'programada_para' | 'pospuesta_hasta'>, now: number) {
  return isTaskActionable(task) && getTaskEffectiveTime(task) <= now;
}
