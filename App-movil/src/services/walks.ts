import { selectAll, selectInChunks } from '@/services/pagination';
import { supabase } from '@/services/supabase';
import type { WalkDetail, WalkSummary, WalkWithPets } from '@/types/database';
import { logSupabaseError } from '@/utils/errors';

/** Columnas para listas: todo menos la ruta completa. */
const SUMMARY_COLUMNS =
  'id, hogar_id, iniciado_en, terminado_en, duracion_seg, distancia_m, pasos, puntos_ruta, origen, dispositivo_id, registrado_por, creado_en, actualizado_en';

export type ManualWalkInput = {
  /** UUID generado en el dispositivo: un reintento no duplica el paseo. */
  id: string;
  householdId: string;
  startedAt: Date;
  durationMinutes: number;
  distanceKm: number | null;
  steps: number | null;
  petIds: string[];
};

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export async function registerManualWalk(input: ManualWalkInput) {
  if (!input.petIds.length) throw new Error('Selecciona al menos una mascota.');
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 1440) {
    throw new Error('La duración debe estar entre 1 y 1440 minutos.');
  }
  if (!Number.isFinite(input.startedAt.getTime())) throw new Error('La fecha del paseo no es válida.');
  if (input.startedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    throw new Error('El paseo no puede empezar en el futuro.');
  }
  if (input.distanceKm !== null && (input.distanceKm < 0 || input.distanceKm > 1000)) {
    throw new Error('La distancia debe estar entre 0 y 1000 km.');
  }
  if (input.steps !== null && (!Number.isInteger(input.steps) || input.steps < 0 || input.steps > 1_000_000)) {
    throw new Error('Los pasos deben estar entre 0 y 1,000,000.');
  }

  const { data, error } = await supabase.rpc('registrar_paseo', {
    p_id: input.id,
    p_hogar_id: input.householdId,
    p_iniciado_en: input.startedAt.toISOString(),
    p_duracion_seg: input.durationMinutes * 60,
    p_distancia_m: input.distanceKm === null ? null : Math.round(input.distanceKm * 1000),
    p_pasos: input.steps,
    p_mascotas: input.petIds,
  });
  if (error) {
    logSupabaseError('rpc.registrar_paseo', error, { householdId: input.householdId });
    throw error;
  }
  if (typeof data !== 'string') throw new Error('Supabase no devolvió el paseo registrado.');
  return data;
}

async function attachPets<T extends { id: string }>(walks: T[]) {
  const links = await selectInChunks(
    walks.map((walk) => walk.id),
    (ids) => supabase.from('paseo_mascotas').select('paseo_id, mascota_id').in('paseo_id', ids),
  );
  const petsByWalk = new Map<string, string[]>();
  for (const link of links) {
    const current = petsByWalk.get(link.paseo_id) ?? [];
    current.push(link.mascota_id);
    petsByWalk.set(link.paseo_id, current);
  }
  return walks.map((walk) => ({ ...walk, mascota_ids: petsByWalk.get(walk.id) ?? [] }));
}

export async function getWalks(
  householdId: string,
  { sinceIso, untilIso, petId }: { sinceIso?: string; untilIso?: string; petId?: string } = {},
): Promise<WalkWithPets[]> {
  const walks = await selectAll<WalkSummary>((from, to) => {
    let query = supabase.from('paseos').select(SUMMARY_COLUMNS).eq('hogar_id', householdId);
    if (sinceIso) query = query.gte('iniciado_en', sinceIso);
    if (untilIso) query = query.lt('iniciado_en', untilIso);
    return query.order('iniciado_en', { ascending: false }).range(from, to);
  });
  if (!walks.length) return [];
  const withPets = await attachPets(walks);
  return petId ? withPets.filter((walk) => walk.mascota_ids.includes(petId)) : withPets;
}

export async function getWalk(walkId: string): Promise<WalkDetail | null> {
  const { data, error } = await supabase.from('paseos').select('*').eq('id', walkId).maybeSingle();
  if (error) {
    logSupabaseError('paseos.selectDetail', error, { walkId });
    throw error;
  }
  if (!data) return null;
  const [withPets] = await attachPets([data]);
  return withPets;
}

export async function deleteWalk(walkId: string) {
  const { data, error } = await supabase.from('paseos').delete().eq('id', walkId).select('id');
  if (error) {
    logSupabaseError('paseos.delete', error, { walkId });
    throw error;
  }
  if (!data?.length) throw new Error('No se pudo eliminar el paseo. Puede que ya no exista.');
}
