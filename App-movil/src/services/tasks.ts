import { POSTPONE_OPTIONS, TASK_GENERATION_DAYS } from '@/constants/options';
import { selectAll, uniqueIds } from '@/services/pagination';
import { supabase } from '@/services/supabase';
import type { TaskRow, TaskStatus, TaskWithContext } from '@/types/database';
import { addDays, dateForTimeZone } from '@/utils/dates';
import { logSupabaseError } from '@/utils/errors';

export type TaskAction = Extract<TaskStatus, 'hecha' | 'omitida' | 'pospuesta'>;

const GENERATION_MAX_AGE_MS = 15 * 60 * 1000;
const lastGeneration = new Map<string, number>();

/** Genera en Supabase las tareas de los próximos días (igual que las dosis de MedTime). */
export async function generateTasks(householdId: string, days = TASK_GENERATION_DAYS) {
  const { data, error } = await supabase.rpc('generar_tareas', { p_hogar_id: householdId, p_dias: days });
  if (error) {
    logSupabaseError('rpc.generar_tareas', error, { householdId });
    throw error;
  }
  lastGeneration.set(householdId, Date.now());
  return typeof data === 'number' ? data : 0;
}

/** Genera tareas solo si no se hizo en los últimos 15 minutos (así la ventana avanza cada día). */
export async function ensureTasksGenerated(householdId: string) {
  const last = lastGeneration.get(householdId) ?? 0;
  if (Date.now() - last < GENERATION_MAX_AGE_MS) return 0;
  return generateTasks(householdId);
}

/** guardar_cuidado ya genera las tareas; esto evita repetir la llamada enseguida. */
export function markTasksGenerated(householdId: string) {
  lastGeneration.set(householdId, Date.now());
}

async function attachContext(tasks: TaskRow[]): Promise<TaskWithContext[]> {
  if (!tasks.length) return [];

  const { data: schedules, error: schedulesError } = await supabase
    .from('horarios_cuidado')
    .select('*')
    .in('id', uniqueIds(tasks.map((task) => task.horario_id)));
  if (schedulesError) {
    logSupabaseError('horarios_cuidado.selectForTasks', schedulesError);
    throw schedulesError;
  }

  const [{ data: cares, error: caresError }, { data: pets, error: petsError }] = await Promise.all([
    supabase.from('cuidados').select('*').in('id', uniqueIds((schedules ?? []).map((schedule) => schedule.cuidado_id))),
    supabase.from('mascotas').select('*').in('id', uniqueIds(tasks.map((task) => task.mascota_id))),
  ]);
  if (caresError || petsError) {
    const error = caresError ?? petsError;
    logSupabaseError('tareas.selectContext', error);
    throw error;
  }

  const scheduleMap = new Map((schedules ?? []).map((schedule) => [schedule.id, schedule]));
  const careMap = new Map((cares ?? []).map((care) => [care.id, care]));
  const petMap = new Map((pets ?? []).map((pet) => [pet.id, pet]));

  return tasks.flatMap((task) => {
    const horario = scheduleMap.get(task.horario_id);
    const cuidado = horario ? careMap.get(horario.cuidado_id) : undefined;
    const mascota = petMap.get(task.mascota_id);
    return horario && cuidado && mascota ? [{ ...task, horario, cuidado, mascota }] : [];
  });
}

export async function getTasksInRange(
  householdIds: string[],
  startIso: string,
  endIso: string,
  { petId }: { petId?: string } = {},
) {
  if (!householdIds.length) return [] as TaskWithContext[];
  const rows = await selectAll<TaskRow>((from, to) => {
    let query = supabase
      .from('tareas_programadas')
      .select('*')
      .in('hogar_id', householdIds)
      .gte('programada_para', startIso)
      .lt('programada_para', endIso);
    if (petId) query = query.eq('mascota_id', petId);
    return query.order('programada_para').range(from, to);
  });
  return attachContext(rows);
}

export function getTasksForDay(householdId: string, dateKey: string, timeZone: string) {
  const start = dateForTimeZone(dateKey, '00:00', timeZone).toISOString();
  const end = dateForTimeZone(addDays(dateKey, 1), '00:00', timeZone).toISOString();
  return getTasksInRange([householdId], start, end);
}

/** La tarea ya estaba resuelta (por ejemplo, otro miembro la marcó antes). */
export class TaskAlreadyResolvedError extends Error {
  readonly task: TaskRow;

  constructor(task: TaskRow) {
    super(task.estado === 'hecha' ? 'Esta tarea ya estaba marcada como hecha.' : 'Esta tarea ya estaba omitida.');
    this.name = 'TaskAlreadyResolvedError';
    this.task = task;
  }
}

export async function updateTaskStatus(taskId: string, status: TaskAction, postponeMinutes?: number) {
  let postponedUntil: string | null = null;
  if (status === 'pospuesta') {
    if (!postponeMinutes || !POSTPONE_OPTIONS.some((option) => option.minutes === postponeMinutes)) {
      throw new Error('Selecciona cuánto tiempo quieres posponer la tarea.');
    }
    postponedUntil = new Date(Date.now() + postponeMinutes * 60_000).toISOString();
  }

  // La actualización condicional hace seguros los toques repetidos y los cambios
  // simultáneos de dos miembros. hecha_por/hecha_en los pone el servidor.
  const { data, error } = await supabase
    .from('tareas_programadas')
    .update({ estado: status, pospuesta_hasta: postponedUntil })
    .eq('id', taskId)
    .in('estado', ['pendiente', 'pospuesta'])
    .select()
    .maybeSingle();
  if (error) {
    logSupabaseError('tareas_programadas.updateStatus', error, { taskId, status });
    throw error;
  }
  if (data) return data;

  const { data: current, error: currentError } = await supabase
    .from('tareas_programadas')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();
  if (currentError) {
    logSupabaseError('tareas_programadas.selectAfterUpdate', currentError, { taskId });
    throw currentError;
  }
  if (!current) throw new Error('No se encontró la tarea. Puede que su cuidado haya cambiado.');
  if (current.estado === 'hecha' || current.estado === 'omitida') throw new TaskAlreadyResolvedError(current);
  throw new Error('No se pudo actualizar la tarea. Revisa tu conexión e intenta de nuevo.');
}
