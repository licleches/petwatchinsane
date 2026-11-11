import { supabase } from '@/services/supabase';
import type { VaccineRow, VaccineUpdate } from '@/types/database';
import { logSupabaseError } from '@/utils/errors';

export type VaccineInput = {
  nombre: string;
  aplicada_en: string;
  proxima_en: string | null;
  veterinario: string | null;
  notas: string | null;
};

export async function getVaccinesForPets(petIds: string[], { sinceDate, untilDate }: { sinceDate?: string; untilDate?: string } = {}) {
  if (!petIds.length) return [] as VaccineRow[];
  let query = supabase.from('vacunas').select('*').in('mascota_id', petIds);
  if (sinceDate) query = query.gte('aplicada_en', sinceDate);
  if (untilDate) query = query.lte('aplicada_en', untilDate);
  const { data, error } = await query.order('aplicada_en', { ascending: false });
  if (error) {
    logSupabaseError('vacunas.selectForPets', error);
    throw error;
  }
  return data ?? [];
}

export function getVaccinesForPet(petId: string) {
  return getVaccinesForPets([petId]);
}

export async function getVaccine(vaccineId: string) {
  const { data, error } = await supabase.from('vacunas').select('*').eq('id', vaccineId).maybeSingle();
  if (error) {
    logSupabaseError('vacunas.selectDetail', error, { vaccineId });
    throw error;
  }
  return data;
}

function validateVaccine(input: VaccineInput): Required<VaccineUpdate> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('Escribe el nombre de la vacuna.');
  if (nombre.length > 80) throw new Error('El nombre no puede superar 80 caracteres.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.aplicada_en)) throw new Error('Selecciona la fecha de aplicación.');
  if (input.proxima_en && input.proxima_en < input.aplicada_en) {
    throw new Error('La próxima dosis no puede ser antes de la aplicación.');
  }
  const veterinario = input.veterinario?.trim() || null;
  if (veterinario && veterinario.length > 50) throw new Error('El veterinario o clínica no puede superar 50 caracteres.');
  const notas = input.notas?.trim() || null;
  if (notas && notas.length > 500) throw new Error('Las notas no pueden superar 500 caracteres.');
  return { nombre, aplicada_en: input.aplicada_en, proxima_en: input.proxima_en || null, veterinario, notas };
}

export async function createVaccine(petId: string, input: VaccineInput) {
  const values = validateVaccine(input);
  const { data, error } = await supabase
    .from('vacunas')
    .insert({ ...values, mascota_id: petId })
    .select()
    .single();
  if (error) {
    logSupabaseError('vacunas.insert', error, { petId });
    throw error;
  }
  return data;
}

export async function updateVaccine(vaccineId: string, input: VaccineInput) {
  const values = validateVaccine(input);
  const { data, error } = await supabase.from('vacunas').update(values).eq('id', vaccineId).select().maybeSingle();
  if (error) {
    logSupabaseError('vacunas.update', error, { vaccineId });
    throw error;
  }
  if (!data) throw new Error('No se encontró la vacuna.');
  return data;
}

export async function deleteVaccine(vaccineId: string) {
  const { data, error } = await supabase.from('vacunas').delete().eq('id', vaccineId).select('id');
  if (error) {
    logSupabaseError('vacunas.delete', error, { vaccineId });
    throw error;
  }
  if (!data?.length) throw new Error('No se pudo eliminar la vacuna. Puede que ya no exista.');
}
