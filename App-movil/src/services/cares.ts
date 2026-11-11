import { supabase } from '@/services/supabase';
import { generateTasks, markTasksGenerated } from '@/services/tasks';
import type { CareScheduleInput, CareScheduleRow, CareType, CareWithSchedules } from '@/types/database';
import { logSupabaseError } from '@/utils/errors';

export type CareInput = {
  tipo: CareType;
  nombre: string;
  detalle: string | null;
  horarios: CareScheduleInput[];
};

function groupSchedules(schedules: CareScheduleRow[]) {
  const map = new Map<string, CareScheduleRow[]>();
  for (const schedule of schedules) {
    const current = map.get(schedule.cuidado_id) ?? [];
    current.push(schedule);
    map.set(schedule.cuidado_id, current);
  }
  return map;
}

/** Cuidados de una mascota con sus horarios activos (los inactivos son historial). */
export async function getCaresForPet(petId: string): Promise<CareWithSchedules[]> {
  const { data: cares, error } = await supabase
    .from('cuidados')
    .select('*')
    .eq('mascota_id', petId)
    .order('activo', { ascending: false })
    .order('creado_en');
  if (error) {
    logSupabaseError('cuidados.selectForPet', error, { petId });
    throw error;
  }
  if (!cares?.length) return [];

  const { data: schedules, error: schedulesError } = await supabase
    .from('horarios_cuidado')
    .select('*')
    .in('cuidado_id', cares.map((care) => care.id))
    .eq('activo', true)
    .order('hora');
  if (schedulesError) {
    logSupabaseError('horarios_cuidado.selectForPet', schedulesError, { petId });
    throw schedulesError;
  }

  const byCare = groupSchedules(schedules ?? []);
  return cares.map((care) => ({ ...care, horarios: byCare.get(care.id) ?? [] }));
}

export async function getCare(careId: string): Promise<CareWithSchedules | null> {
  const { data: care, error } = await supabase.from('cuidados').select('*').eq('id', careId).maybeSingle();
  if (error) {
    logSupabaseError('cuidados.selectDetail', error, { careId });
    throw error;
  }
  if (!care) return null;

  const { data: schedules, error: schedulesError } = await supabase
    .from('horarios_cuidado')
    .select('*')
    .eq('cuidado_id', careId)
    .eq('activo', true)
    .order('hora');
  if (schedulesError) {
    logSupabaseError('horarios_cuidado.selectDetail', schedulesError, { careId });
    throw schedulesError;
  }
  return { ...care, horarios: schedules ?? [] };
}

function validateCareInput(input: CareInput) {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('Escribe el nombre del cuidado.');
  if (nombre.length > 60) throw new Error('El nombre no puede superar 60 caracteres.');
  const detalle = input.detalle?.trim() || null;
  if (detalle && detalle.length > 200) throw new Error('El detalle no puede superar 200 caracteres.');
  if (!input.horarios.length) throw new Error('Agrega al menos un horario.');
  if (input.horarios.length > 12) throw new Error('Puedes agregar hasta 12 horarios por cuidado.');
  if (input.horarios.some((schedule) => !schedule.dias_semana.length)) throw new Error('Selecciona al menos un día de la semana.');
  return {
    nombre,
    detalle,
    horarios: input.horarios.map((schedule) => ({
      hora: schedule.hora.slice(0, 5),
      dias_semana: Array.from(new Set(schedule.dias_semana)).sort((left, right) => left - right),
    })),
  };
}

/**
 * Crea o edita un cuidado con sus horarios en una sola transacción (RPC
 * guardar_cuidado). Los horarios que no cambian se conservan; los quitados se
 * desactivan y sus tareas futuras se borran. Devuelve el id del cuidado.
 */
export async function saveCare(petId: string, householdId: string, input: CareInput, careId: string | null) {
  const values = validateCareInput(input);
  const { data, error } = await supabase.rpc('guardar_cuidado', {
    p_cuidado_id: careId,
    p_mascota_id: petId,
    p_tipo: input.tipo,
    p_nombre: values.nombre,
    p_detalle: values.detalle,
    p_horarios: values.horarios,
  });
  if (error) {
    logSupabaseError('rpc.guardar_cuidado', error, { petId, careId: careId ?? undefined });
    throw error;
  }
  if (typeof data !== 'string') throw new Error('Supabase no devolvió el cuidado guardado.');
  markTasksGenerated(householdId);
  return data;
}

export async function setCareActive(careId: string, householdId: string, active: boolean) {
  const { data, error } = await supabase
    .from('cuidados')
    .update({ activo: active })
    .eq('id', careId)
    .select()
    .maybeSingle();
  if (error) {
    logSupabaseError('cuidados.setActive', error, { careId });
    throw error;
  }
  if (!data) throw new Error('No se encontró el cuidado.');
  // Al reactivar, se vuelven a crear sus tareas de los próximos días.
  if (active) await generateTasks(householdId);
  return data;
}
