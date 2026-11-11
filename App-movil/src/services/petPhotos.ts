import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/services/supabase';
import { base64ByteLength, base64ToArrayBuffer } from '@/utils/base64';
import { logSupabaseError } from '@/utils/errors';

export type PickedPhoto = {
  uri: string;
  base64: string;
  mimeType: string;
};

export type PhotoChange = { type: 'keep' } | { type: 'replace'; photo: PickedPhoto } | { type: 'remove' };

const BUCKET = 'fotos-mascotas';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60 * 60;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// Las URLs firmadas se reutilizan mientras sigan vigentes.
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

function normalizeMimeType(value?: string | null) {
  const type = value?.toLowerCase() ?? '';
  if (type === 'image/jpg') return 'image/jpeg';
  return ALLOWED_TYPES.includes(type) ? type : 'image/jpeg';
}

function extensionFor(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return 'heic';
  return 'jpg';
}

/** Abre la cámara o la galería con recorte cuadrado. Devuelve null si se cancela. */
export async function pickPetPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Permite el acceso a la cámara en los ajustes del teléfono para tomar la foto.');
    }
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.6,
    base64: true,
    exif: false,
  };
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets.length) return null;

  const asset = result.assets[0];
  if (!asset.base64) throw new Error('No se pudo leer la imagen seleccionada. Intenta con otra.');
  if (base64ByteLength(asset.base64) > MAX_PHOTO_BYTES) {
    throw new Error('La foto pesa más de 5 MB. Recórtala o elige otra.');
  }
  return { uri: asset.uri, base64: asset.base64, mimeType: normalizeMimeType(asset.mimeType) };
}

/** Sube la foto a {hogar_id}/{mascota_id}/... y devuelve la ruta guardada en mascotas.foto_url. */
export async function uploadPetPhoto(householdId: string, petId: string, photo: PickedPhoto) {
  const path = `${householdId}/${petId}/${Date.now()}.${extensionFor(photo.mimeType)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, base64ToArrayBuffer(photo.base64), { contentType: photo.mimeType, upsert: false });
  if (error) {
    logSupabaseError('storage.uploadPetPhoto', error, { householdId, petId });
    throw error;
  }
  return path;
}

/** Borra una foto anterior. Si falla solo se registra: no debe bloquear el guardado. */
export async function deletePetPhoto(path: string) {
  signedUrlCache.delete(path);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) logSupabaseError('storage.deletePetPhoto', error);
}

export function getCachedPetPhotoUrl(path: string) {
  const cached = signedUrlCache.get(path);
  return cached && cached.expiresAt > Date.now() + 60_000 ? cached.url : null;
}

export async function getPetPhotoUrl(path: string) {
  const cached = getCachedPetPhotoUrl(path);
  if (cached) return cached;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) {
    logSupabaseError('storage.createSignedUrl', error);
    throw error;
  }
  signedUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_SECONDS * 1000 });
  return data.signedUrl;
}
