import { supabase } from '@/services/supabase';
import type { VetVisitRow, VetVisitUpdate } from '@/types/database';
import { logSupabaseError } from '@/utils/errors';

export type VetVisitInput = {
  fecha: string;
  clinica: string | null;
  motivo: string;
  diagnostico: string | null;
  tratamiento: string | null;
  costo: number | null;
  notas: string | null;
};

const currencyFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export function formatCost(value: number) {
  return currencyFormatter.format(value);
}

export async function getVisitsForPets(petIds: string[], { sinceDate, untilDate }: { sinceDate?: string; untilDate?: string } = {}) {
  if (!petIds.length) return [] as VetVisitRow[];
  let query = supabase.from('visitas_veterinario').select('*').in('mascota_id', petIds);
  if (sinceDate) query = query.gte('fecha', sinceDate);
  if (untilDate) query = query.lte('fecha', untilDate);
  const { data, error } = await query.order('fecha', { ascending: false }).order('creado_en', { ascending: false });
  if (error) {
    logSupabaseError('visitas_veterinario.selectForPets', error);
    throw error;
  }
  return data ?? [];
}

export function getVisitsForPet(petId: string) {
  return getVisitsForPets([petId]);
}

export async function getVisit(visitId: string) {
  const { data, error } = await supabase.from('visitas_veterinario').select('*').eq('id', visitId).maybeSingle();
  if (error) {
    logSupabaseError('visitas_veterinario.selectDetail', error, { visitId });
    throw error;
  }
  return data;
}

function optionalText(value: string | null, label: string, maxLength: number) {
  const trimmed = value?.trim() || null;
  if (trimmed && trimmed.length > maxLength) throw new Error(`${label} no puede superar ${maxLength} caracteres.`);
  return trimmed;
}

function validateVisit(input: VetVisitInput): Required<VetVisitUpdate> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) throw new Error('Selecciona la fecha de la visita.');
  const motivo = input.motivo.trim();
  if (!motivo) throw new Error('Escribe el motivo de la visita.');
  if (motivo.length > 120) throw new Error('El motivo no puede superar 120 caracteres.');
  if (input.costo !== null && (!Number.isFinite(input.costo) || input.costo < 0 || input.costo > 99_999_999)) {
    throw new Error('El costo no es válido.');
  }
  return {
    fecha: input.fecha,
    clinica: optionalText(input.clinica, 'La clínica', 50),
    motivo,
    diagnostico: optionalText(input.diagnostico, 'El diagnóstico', 500),
    tratamiento: optionalText(input.tratamiento, 'El tratamiento', 500),
    costo: input.costo === null ? null : Math.round(input.costo * 100) / 100,
    notas: optionalText(input.notas, 'Las notas', 500),
  };
}

export async function createVisit(petId: string, input: VetVisitInput) {
  const values = validateVisit(input);
  const { data, error } = await supabase
    .from('visitas_veterinario')
    .insert({ ...values, mascota_id: petId })
    .select()
    .single();
  if (error) {
    logSupabaseError('visitas_veterinario.insert', error, { petId });
    throw error;
  }
  return data;
}

export async function updateVisit(visitId: string, input: VetVisitInput) {
  const values = validateVisit(input);
  const { data, error } = await supabase
    .from('visitas_veterinario')
    .update(values)
    .eq('id', visitId)
    .select()
    .maybeSingle();
  if (error) {
    logSupabaseError('visitas_veterinario.update', error, { visitId });
    throw error;
  }
  if (!data) throw new Error('No se encontró la visita.');
  return data;
}

export async function deleteVisit(visitId: string) {
  const { data, error } = await supabase.from('visitas_veterinario').delete().eq('id', visitId).select('id');
  if (error) {
    logSupabaseError('visitas_veterinario.delete', error, { visitId });
    throw error;
  }
  if (!data?.length) throw new Error('No se pudo eliminar la visita. Puede que ya no exista.');
}
