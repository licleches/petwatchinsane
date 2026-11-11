import { CARE_TYPES, INCIDENT_TYPES, type IconName } from '@/constants/options';
import type { IncidentRow, TaskWithContext, VaccineRow, VetVisitRow, WalkWithPets } from '@/types/database';
import { dateForTimeZone, formatDateForDisplay, formatDuration, formatTime, getDateKey } from '@/utils/dates';
import { getTaskEffectiveTime, isTaskActionable } from '@/utils/schedules';
import { formatDistance } from '@/utils/walks';
import { isFromWatch } from '@/utils/watch';

export type HistoryKind = 'tarea' | 'incidente' | 'paseo' | 'vacuna' | 'visita';
export type HistoryTone = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'primary';

export type HistoryEntry = {
  key: string;
  kind: HistoryKind;
  recordId: string;
  /** Momento para ordenar (ms). Vacunas y visitas solo tienen fecha: se ubican a mediodía. */
  at: number;
  dateKey: string;
  timeLabel: string;
  petIds: string[];
  title: string;
  subtitle: string | null;
  icon: IconName;
  tone: HistoryTone;
  /** El registro vino del smartwatch (origen 'reloj' o dispositivo_id). */
  fromWatch: boolean;
};

export type HistoryData = {
  tasks: TaskWithContext[];
  incidents: IncidentRow[];
  walks: WalkWithPets[];
  vaccines: VaccineRow[];
  visits: VetVisitRow[];
};

type BuildOptions = {
  now: number;
  timeZone: string;
  petName: (petId: string) => string;
  /** "ti" si es el usuario actual; null si no se conoce. */
  actorName: (userId: string | null) => string | null;
};

function taskEntry(task: TaskWithContext, { now, timeZone, actorName }: BuildOptions): HistoryEntry | null {
  const scheduledAt = Date.parse(task.programada_para);
  // Solo tareas ya resueltas o cuya hora ya pasó (las futuras no son historial).
  if (isTaskActionable(task) && getTaskEffectiveTime(task) > now) return null;
  const actor = actorName(task.hecha_por);
  const scheduled = formatTime(task.programada_para, timeZone);
  let subtitle: string;
  let tone: HistoryTone;
  if (task.estado === 'hecha') {
    subtitle = `Hecha${actor ? ` por ${actor}` : ''}${task.hecha_en ? ` a las ${formatTime(task.hecha_en, timeZone)}` : ''}`;
    tone = 'success';
  } else if (task.estado === 'omitida') {
    subtitle = `Omitida${actor ? ` por ${actor}` : ''}`;
    tone = 'error';
  } else {
    subtitle = 'Sin confirmar';
    tone = 'warning';
  }
  return {
    key: `tarea-${task.id}`,
    kind: 'tarea',
    recordId: task.id,
    at: scheduledAt,
    dateKey: getDateKey(new Date(scheduledAt), timeZone),
    timeLabel: scheduled,
    petIds: [task.mascota_id],
    title: `${task.cuidado.nombre} · ${task.mascota.nombre}`,
    subtitle: `${CARE_TYPES[task.cuidado.tipo].label} de las ${scheduled}. ${subtitle}.`,
    icon: CARE_TYPES[task.cuidado.tipo].icon,
    tone,
    fromWatch: isFromWatch(task),
  };
}

/** Une tareas, incidentes, paseos, vacunas y visitas en una sola línea de tiempo (más reciente primero). */
export function buildHistoryEntries(data: HistoryData, options: BuildOptions): HistoryEntry[] {
  const { timeZone, petName, actorName } = options;
  const entries: HistoryEntry[] = [];

  for (const task of data.tasks) {
    const entry = taskEntry(task, options);
    if (entry) entries.push(entry);
  }

  for (const incident of data.incidents) {
    const at = Date.parse(incident.ocurrido_en);
    const actor = actorName(incident.registrado_por);
    entries.push({
      key: `incidente-${incident.id}`,
      kind: 'incidente',
      recordId: incident.id,
      at,
      dateKey: getDateKey(new Date(at), timeZone),
      timeLabel: formatTime(incident.ocurrido_en, timeZone),
      petIds: [incident.mascota_id],
      title: `${INCIDENT_TYPES[incident.tipo].label} · ${petName(incident.mascota_id)}`,
      subtitle: [actor ? `Registrado por ${actor}` : null, incident.nota].filter(Boolean).join('. ') || null,
      icon: INCIDENT_TYPES[incident.tipo].icon,
      tone: 'error',
      fromWatch: isFromWatch(incident),
    });
  }

  for (const walk of data.walks) {
    const at = Date.parse(walk.iniciado_en);
    const fromWatch = isFromWatch(walk);
    const details = [
      walk.mascota_ids.map(petName).join(', '),
      walk.distancia_m !== null ? formatDistance(walk.distancia_m) : null,
      fromWatch ? null : 'manual',
    ].filter(Boolean);
    entries.push({
      key: `paseo-${walk.id}`,
      kind: 'paseo',
      recordId: walk.id,
      at,
      dateKey: getDateKey(new Date(at), timeZone),
      timeLabel: formatTime(walk.iniciado_en, timeZone),
      petIds: walk.mascota_ids,
      title: `Paseo de ${formatDuration(walk.duracion_seg)}`,
      subtitle: details.join(' · '),
      icon: 'walk-outline',
      tone: 'success',
      fromWatch,
    });
  }

  for (const vaccine of data.vaccines) {
    entries.push({
      key: `vacuna-${vaccine.id}`,
      kind: 'vacuna',
      recordId: vaccine.id,
      at: dateForTimeZone(vaccine.aplicada_en, '12:00', timeZone).getTime(),
      dateKey: vaccine.aplicada_en,
      timeLabel: 'Día',
      petIds: [vaccine.mascota_id],
      title: `Vacuna ${vaccine.nombre} · ${petName(vaccine.mascota_id)}`,
      subtitle: vaccine.proxima_en ? `Próxima dosis: ${formatDateForDisplay(vaccine.proxima_en)}` : vaccine.veterinario,
      icon: 'medical-outline',
      tone: 'info',
      fromWatch: false,
    });
  }

  for (const visit of data.visits) {
    entries.push({
      key: `visita-${visit.id}`,
      kind: 'visita',
      recordId: visit.id,
      at: dateForTimeZone(visit.fecha, '12:00', timeZone).getTime(),
      dateKey: visit.fecha,
      timeLabel: 'Día',
      petIds: [visit.mascota_id],
      title: `Veterinario: ${visit.motivo} · ${petName(visit.mascota_id)}`,
      subtitle: [visit.clinica, visit.diagnostico].filter(Boolean).join(' · ') || null,
      icon: 'medkit-outline',
      tone: 'primary',
      fromWatch: false,
    });
  }

  return entries.sort((left, right) => right.at - left.at);
}

/** Agrupa por día manteniendo el orden (más reciente primero). */
export function groupEntriesByDay(entries: HistoryEntry[]) {
  const groups: { dateKey: string; entries: HistoryEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.dateKey === entry.dateKey) last.entries.push(entry);
    else groups.push({ dateKey: entry.dateKey, entries: [entry] });
  }
  return groups;
}
