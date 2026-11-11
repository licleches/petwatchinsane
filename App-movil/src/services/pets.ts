import { deletePetPhoto, type PhotoChange, uploadPetPhoto } from '@/services/petPhotos';
import { supabase } from '@/services/supabase';
import type { PetRow, PetSex, PetUpdate, Species } from '@/types/database';
import { dateKeyFromLocalDate, minPetBirthDate, PET_MAX_AGE_YEARS } from '@/utils/dates';
import { getErrorMessage, logSupabaseError } from '@/utils/errors';
import { newId } from '@/utils/ids';

export const PET_BREED_MAX_LENGTH = 30;

export type PetInput = {
  nombre: string;
  especie: Species;
  raza: string | null;
  sexo: PetSex | null;
  fecha_nacimiento: string | null;
  peso_kg: number | null;
  meta_paseo_min_dia: number;
  notas: string | null;
};

export type PetSaveResult = {
  pet: PetRow;
  /** Si la mascota se guardó pero la foto no se pudo subir. */
  photoError: string | null;
};

export async function getPets(householdId: string) {
  const { data, error } = await supabase
    .from('mascotas')
    .select('*')
    .eq('hogar_id', householdId)
    .order('activa', { ascending: false })
    .order('nombre');
  if (error) {
    logSupabaseError('mascotas.selectList', error, { householdId });
    throw error;
  }
  return data ?? [];
}

export async function getPet(petId: string) {
  const { data, error } = await supabase.from('mascotas').select('*').eq('id', petId).maybeSingle();
  if (error) {
    logSupabaseError('mascotas.selectDetail', error, { petId });
    throw error;
  }
  return data;
}

function validatePetInput(input: PetInput): PetInput {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('El nombre de la mascota es obligatorio.');
  if (nombre.length > 50) throw new Error('El nombre no puede superar 50 caracteres.');
  const raza = input.raza?.trim() || null;
  if (raza && raza.length > PET_BREED_MAX_LENGTH) {
    throw new Error(`La raza no puede superar ${PET_BREED_MAX_LENGTH} caracteres.`);
  }
  if (input.peso_kg !== null && (!Number.isFinite(input.peso_kg) || input.peso_kg <= 0 || input.peso_kg > 200)) {
    throw new Error('El peso debe ser mayor que 0 y de máximo 200 kg.');
  }
  if (!Number.isInteger(input.meta_paseo_min_dia) || input.meta_paseo_min_dia < 0 || input.meta_paseo_min_dia > 600) {
    throw new Error('La meta de paseo debe estar entre 0 y 600 minutos al día.');
  }
  const notas = input.notas?.trim() || null;
  if (notas && notas.length > 500) throw new Error('Las notas no pueden superar 500 caracteres.');
  if (input.fecha_nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(input.fecha_nacimiento)) {
    throw new Error('La fecha de nacimiento no es válida.');
  }
  if (input.fecha_nacimiento) {
    const today = new Date();
    if (input.fecha_nacimiento > dateKeyFromLocalDate(today)) {
      throw new Error('La fecha de nacimiento no puede ser futura.');
    }
    if (input.fecha_nacimiento < dateKeyFromLocalDate(minPetBirthDate(today))) {
      throw new Error(`La fecha de nacimiento no puede ser de hace más de ${PET_MAX_AGE_YEARS} años.`);
    }
  }

  return {
    nombre,
    especie: input.especie,
    raza,
    sexo: input.sexo,
    fecha_nacimiento: input.fecha_nacimiento,
    peso_kg: input.peso_kg === null ? null : Math.round(input.peso_kg * 100) / 100,
    meta_paseo_min_dia: input.meta_paseo_min_dia,
    notas,
  };
}

async function updatePetRow(petId: string, values: PetUpdate) {
  const { data, error } = await supabase.from('mascotas').update(values).eq('id', petId).select().maybeSingle();
  if (error) {
    logSupabaseError('mascotas.update', error, { petId });
    throw error;
  }
  if (!data) throw new Error('No se pudo actualizar la mascota. Verifica que sigas en su hogar.');
  return data;
}

export async function createPet(householdId: string, input: PetInput, photoChange: PhotoChange): Promise<PetSaveResult> {
  const values = validatePetInput(input);
  const petId = newId();
  const { data: pet, error } = await supabase
    .from('mascotas')
    .insert({ ...values, id: petId, hogar_id: householdId })
    .select()
    .single();
  if (error) {
    logSupabaseError('mascotas.insert', error, { householdId });
    throw error;
  }

  if (photoChange.type !== 'replace') return { pet, photoError: null };
  try {
    const path = await uploadPetPhoto(householdId, petId, photoChange.photo);
    return { pet: await updatePetRow(petId, { foto_url: path }), photoError: null };
  } catch (photoError) {
    return { pet, photoError: getErrorMessage(photoError, 'No se pudo subir la foto.') };
  }
}

export async function updatePet(pet: PetRow, input: PetInput, photoChange: PhotoChange): Promise<PetSaveResult> {
  const values = validatePetInput(input);
  let photoError: string | null = null;
  let nextPhoto: string | null | undefined;

  if (photoChange.type === 'replace') {
    try {
      nextPhoto = await uploadPetPhoto(pet.hogar_id, pet.id, photoChange.photo);
    } catch (uploadError) {
      photoError = getErrorMessage(uploadError, 'No se pudo subir la foto.');
    }
  } else if (photoChange.type === 'remove') {
    nextPhoto = null;
  }

  const updated = await updatePetRow(pet.id, nextPhoto === undefined ? values : { ...values, foto_url: nextPhoto });
  if (nextPhoto !== undefined && pet.foto_url && pet.foto_url !== nextPhoto) {
    await deletePetPhoto(pet.foto_url);
  }
  return { pet: updated, photoError };
}

export async function setPetActive(petId: string, active: boolean) {
  return updatePetRow(petId, { activa: active });
}
