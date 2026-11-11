import { selectAll } from '@/services/pagination';
import { supabase } from '@/services/supabase';
import type { IncidentRow, IncidentType } from '@/types/database';
import { logSupabaseError } from '@/utils/errors';

export type IncidentInput = {
  /** UUID generado en el dispositivo: un reintento no duplica el incidente. */
  id: string;
  petId: string;
  tipo: IncidentType;
  ocurridoEn: Date;
  nota: string | null;
};

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export async function createIncident(input: IncidentInput) {
  const nota = input.nota?.trim() || null;
  if (nota && nota.length > 500) throw new Error('La nota no puede superar 500 caracteres.');
  if (!Number.isFinite(input.ocurridoEn.getTime())) throw new Error('La fecha del incidente no es válida.');
  if (input.ocurridoEn.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    throw new Error('El incidente no puede estar en el futuro.');
  }

  // ON CONFLICT (id) DO NOTHING: el mismo patrón que usará el reloj al sincronizar.
  const { error } = await supabase.from('incidentes').upsert(
    {
      id: input.id,
      mascota_id: input.petId,
      tipo: input.tipo,
      ocurrido_en: input.ocurridoEn.toISOString(),
      nota,
      origen: 'app',
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) {
    logSupabaseError('incidentes.insert', error, { petId: input.petId });
    throw error;
  }
  const saved = await getIncident(input.id);
  if (!saved) throw new Error('El incidente no se pudo guardar. Intenta de nuevo.');
  return saved;
}

export async function getIncident(incidentId: string) {
  const { data, error } = await supabase.from('incidentes').select('*').eq('id', incidentId).maybeSingle();
  if (error) {
    logSupabaseError('incidentes.selectDetail', error, { incidentId });
    throw error;
  }
  return data;
}

export async function getIncidents(
  householdId: string,
  { sinceIso, untilIso, petId, walkId }: { sinceIso?: string; untilIso?: string; petId?: string; walkId?: string } = {},
) {
  return selectAll<IncidentRow>((from, to) => {
    let query = supabase.from('incidentes').select('*').eq('hogar_id', householdId);
    if (petId) query = query.eq('mascota_id', petId);
    if (walkId) query = query.eq('paseo_id', walkId);
    if (sinceIso) query = query.gte('ocurrido_en', sinceIso);
    if (untilIso) query = query.lt('ocurrido_en', untilIso);
    return query.order('ocurrido_en', { ascending: false }).range(from, to);
  });
}

export async function deleteIncident(incidentId: string) {
  const { data, error } = await supabase.from('incidentes').delete().eq('id', incidentId).select('id');
  if (error) {
    logSupabaseError('incidentes.delete', error, { incidentId });
    throw error;
  }
  if (!data?.length) throw new Error('No se pudo eliminar el incidente. Puede que ya no exista.');
}
