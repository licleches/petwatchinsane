// Copiado y adaptado de MedTime (src/services/watchService.ts). Usa las Edge Functions
// watch-pair-preview, watch-pair-approve, watch-devices-list y watch-device-revoke
// (supabase/functions). Contrato: docs/smartwatch/contrato-api.md.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

import { getAuthenticatedUser } from '@/services/auth';
import { supabase } from '@/services/supabase';
import type { WatchConnection, WatchDevice, WatchPairingApproval, WatchPairingPreview } from '@/types/watch';

export const WATCH_PAIRING_CODE_LENGTH = 6;

/** Códigos que indican que el backend del reloj aún no está desplegado o configurado. */
const NOT_CONFIGURED_CODES = new Set(['FUNCTION_NOT_DEPLOYED', 'BACKEND_NOT_READY']);

// Los mensajes del servidor vienen sin acentos (copiados de MedTime); aquí se
// traducen a textos claros para la persona que usa la app.
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CODE: 'El código no es válido. Revisa el que aparece en el reloj.',
  PAIRING_NOT_FOUND: 'No encontramos esa solicitud. Genera un código nuevo en el reloj.',
  PAIRING_CODE_USED: 'Ese código ya se usó. Genera uno nuevo en el reloj.',
  PAIRING_LOCKED: 'Se superó el límite de intentos con este código. Genera uno nuevo en el reloj.',
  PAIRING_EXPIRED: 'El código venció (dura 5 minutos). Genera uno nuevo en el reloj.',
  PAIRING_REVOKED: 'La solicitud se canceló. Genera un código nuevo en el reloj.',
  PAIRING_ALREADY_APPROVED: 'Otra cuenta ya aprobó este reloj.',
  PAIRING_UNAVAILABLE: 'La solicitud ya no está disponible. Genera un código nuevo en el reloj.',
  DEVICE_ALREADY_LINKED: 'Este reloj ya está vinculado a tu cuenta.',
  DEVICE_NOT_READY: 'El reloj todavía no está listo. Intenta de nuevo en unos segundos.',
  DEVICE_REVOKED: 'Este reloj fue desvinculado. Vuelve a vincularlo desde el reloj.',
  DEVICE_NOT_FOUND: 'No encontramos ese reloj en tu cuenta. Puede que ya esté desvinculado.',
  PROFILE_MISSING: 'Tu cuenta no tiene perfil de PetWatch. Cierra sesión y vuelve a entrar.',
  RATE_LIMITED: 'Demasiados intentos. Espera un minuto e intenta de nuevo.',
  UNAUTHORIZED: 'Tu sesión expiró. Cierra sesión y vuelve a entrar.',
  BACKEND_NOT_READY:
    'El backend del reloj no está listo: falta aplicar la migración del reloj o configurar WATCH_PAIRING_CODE_SALT (ver docs/smartwatch/despliegue.md).',
  FUNCTION_NOT_DEPLOYED:
    'Las funciones del reloj no están desplegadas en tu proyecto de Supabase (ver docs/smartwatch/despliegue.md).',
  NETWORK_ERROR: 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.',
  INTERNAL_ERROR: 'El servidor del reloj tuvo un error. Intenta de nuevo en unos minutos.',
};

export class WatchApiError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(message: string, code = 'WATCH_API_ERROR', status: number | null = null) {
    super(message);
    this.name = 'WatchApiError';
    this.code = code;
    this.status = status;
  }
}

export function isWatchNotConfiguredError(error: unknown) {
  return error instanceof WatchApiError && NOT_CONFIGURED_CODES.has(error.code);
}

async function assertSession(expectedUserId: string) {
  const user = await getAuthenticatedUser();
  if (user.id !== expectedUserId) throw new Error('La sesión del smartwatch no coincide con el usuario actual.');
  return user;
}

export function normalizeWatchPairingCode(value: string) {
  return value.replace(/\D/g, '').slice(0, WATCH_PAIRING_CODE_LENGTH);
}

export function validateWatchPairingCode(value: string) {
  const code = normalizeWatchPairingCode(value);
  return code.length === WATCH_PAIRING_CODE_LENGTH && /^\d+$/.test(code);
}

async function readErrorPayload(response: unknown) {
  if (!response || typeof response !== 'object' || !('clone' in response)) return null;
  try {
    const parsed = await (response as Response).clone().json();
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isResponseLike(value: unknown): value is Response {
  return typeof value === 'object' && value !== null && typeof (value as { status?: unknown }).status === 'number';
}

async function toWatchApiError(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  const context = typeof error === 'object' && error !== null ? (error as { context?: unknown }).context : undefined;

  if (error instanceof FunctionsFetchError || name === 'FunctionsFetchError') {
    return new WatchApiError(ERROR_MESSAGES.NETWORK_ERROR, 'NETWORK_ERROR');
  }
  // instanceof es lo normal; la forma de `context` cubre copias duplicadas del SDK (como en MedTime).
  if (error instanceof FunctionsHttpError || error instanceof FunctionsRelayError || isResponseLike(context)) {
    const response = isResponseLike(context) ? context : undefined;
    const status = typeof response?.status === 'number' ? response.status : null;
    const payload = await readErrorPayload(response);
    let code = typeof payload?.error === 'string' ? payload.error : null;
    // El gateway responde 404 sin nuestro campo "error" cuando la función no existe.
    if (!code && status === 404) code = 'FUNCTION_NOT_DEPLOYED';
    if (!code && status === 401) code = 'UNAUTHORIZED';
    if (!code && status !== null && status >= 500) code = 'BACKEND_NOT_READY';
    const finalCode = code ?? 'WATCH_API_ERROR';
    const serverMessage = typeof payload?.message === 'string' ? payload.message : null;
    return new WatchApiError(
      ERROR_MESSAGES[finalCode] ?? serverMessage ?? 'No se pudo completar la operación del smartwatch.',
      finalCode,
      status,
    );
  }
  return new WatchApiError('No se pudo completar la operación del smartwatch.');
}

async function invokeWatchFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw await toWatchApiError(error);
  if (!data) throw new WatchApiError('El backend no devolvió una respuesta válida.');
  return data;
}

type WatchDevicesResponse = {
  devices: {
    id: string;
    name: string | null;
    type: string | null;
    identifier: string | null;
    status: 'pending' | 'linked';
    linked_at: string | null;
    last_synced_at: string | null;
    created_at: string | null;
  }[];
};

export async function getWatchDevices(userId: string): Promise<WatchDevice[]> {
  await assertSession(userId);
  const response = await invokeWatchFunction<WatchDevicesResponse>('watch-devices-list', {});
  return (response.devices ?? []).map((device) => ({
    id: device.id,
    name: device.name,
    type: device.type,
    identifier: device.identifier,
    status: device.status,
    linkedAt: device.linked_at ?? null,
    lastSyncedAt: device.last_synced_at ?? null,
    createdAt: device.created_at ?? null,
  }));
}

/** Estado del reloj. Si el backend del reloj no está desplegado, devuelve "not_configured" en vez de fallar. */
export async function getWatchConnection(userId: string): Promise<WatchConnection> {
  let devices: WatchDevice[];
  try {
    devices = await getWatchDevices(userId);
  } catch (error) {
    if (isWatchNotConfiguredError(error)) {
      return { state: 'not_configured', devices: [], message: (error as WatchApiError).message };
    }
    throw error;
  }
  if (!devices.length) {
    return { state: 'no_device', devices, message: 'No hay un smartwatch vinculado a tu cuenta.' };
  }
  if (devices.some((device) => device.status === 'linked')) {
    return {
      state: 'linked',
      devices,
      message: 'El reloj está vinculado: recibe avisos, mide paseos y registra incidentes de tus hogares.',
    };
  }
  return {
    state: 'pending',
    devices,
    message: 'Aprobaste la vinculación. Abre PetWatch en el reloj para que termine de conectarse.',
  };
}

export async function previewWatchPairing(userId: string, code: string): Promise<WatchPairingPreview> {
  await assertSession(userId);
  if (!validateWatchPairingCode(code)) throw new Error(`El código debe tener ${WATCH_PAIRING_CODE_LENGTH} dígitos.`);
  const response = await invokeWatchFunction<{
    request_id: string;
    device_name: string;
    device_type: string;
    status: 'pending' | 'approved' | 'claimed';
    expires_at: string;
    can_approve: boolean;
  }>('watch-pair-preview', { code: normalizeWatchPairingCode(code) });
  return {
    requestId: response.request_id,
    deviceName: response.device_name,
    deviceType: response.device_type,
    status: response.status,
    expiresAt: response.expires_at,
    canApprove: response.can_approve,
  };
}

export async function approveWatchPairing(userId: string, requestId: string, code: string): Promise<WatchPairingApproval> {
  await assertSession(userId);
  if (!validateWatchPairingCode(code)) throw new Error(`El código debe tener ${WATCH_PAIRING_CODE_LENGTH} dígitos.`);
  const response = await invokeWatchFunction<{
    request_id: string;
    device_id: string;
    status: 'pending' | 'linked';
    linked_at: string | null;
    expires_at: string;
  }>('watch-pair-approve', { request_id: requestId, code: normalizeWatchPairingCode(code) });
  return {
    requestId: response.request_id,
    deviceId: response.device_id,
    status: response.status,
    linkedAt: response.linked_at,
    expiresAt: response.expires_at,
  };
}

export async function unlinkWatchDevice(userId: string, deviceId: string) {
  await assertSession(userId);
  if (!deviceId.trim()) throw new Error('No se recibió un identificador de dispositivo válido.');
  await invokeWatchFunction('watch-device-revoke', { device_id: deviceId });
}
