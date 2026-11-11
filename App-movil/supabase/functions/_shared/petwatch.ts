import { ApiError, isRecord, isUuid } from './http.ts';
import { getAdminClient } from './server.ts';

// Valores permitidos (los mismos checks que la migración inicial de PetWatch).
export const TASK_STATUSES = ['hecha', 'pospuesta', 'omitida'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const POSTPONE_MINUTES = [15, 30, 60, 120] as const;
export const INCIDENT_TYPES = ['vomito', 'no_comio', 'cojea', 'diarrea', 'pelea', 'otro'] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

// Límites de tamaño de las solicitudes del reloj.
export const MAX_ROUTE_POINTS = 2000;
export const MAX_WALK_PETS = 10;
export const MAX_WALK_INCIDENTS = 50;
export const MAX_INCIDENTS_PER_PUSH = 50;
export const MAX_NOTE_LENGTH = 500;
export const MAX_WALK_SECONDS = 24 * 60 * 60;
export const MAX_DISTANCE_M = 1_000_000;
export const MAX_STEPS = 1_000_000;

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_EPOCH_MS = 4_102_444_800_000; // 2100-01-01
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/;

export function invalid(message: string, code = 'INVALID_INPUT'): never {
  throw new ApiError(400, code, message);
}

export function uuidField(value: unknown, field: string): string {
  if (typeof value !== 'string' || !isUuid(value.trim())) {
    invalid(`El campo ${field} no es un UUID valido.`);
  }
  return value.trim().toLowerCase();
}

/** Fecha ISO-8601 con zona horaria; no puede estar en el futuro ni tener más de 90 días. */
export function dateField(value: unknown, field: string, now: number): Date {
  if (typeof value !== 'string' || !ISO_DATE_REGEX.test(value.trim())) {
    invalid(`El campo ${field} debe ser una fecha ISO-8601 con zona horaria.`, 'INVALID_DATE');
  }
  // Date solo admite milisegundos: se recortan los dígitos extra de la fracción.
  const parsed = new Date(value.trim().replace(/(\.\d{3})\d+/, '$1'));
  const time = parsed.getTime();
  if (!Number.isFinite(time)) {
    invalid(`El campo ${field} no es una fecha valida.`, 'INVALID_DATE');
  }
  if (time > now + FUTURE_TOLERANCE_MS) {
    invalid(`El campo ${field} no puede estar en el futuro.`, 'INVALID_DATE');
  }
  if (time < now - MAX_AGE_MS) {
    invalid(`El campo ${field} tiene mas de 90 dias.`, 'INVALID_DATE');
  }
  return parsed;
}

export function optionalNumber(value: unknown, field: string, min: number, max: number): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    invalid(`El campo ${field} debe ser un numero entre ${min} y ${max}.`);
  }
  return value;
}

export function optionalInteger(value: unknown, field: string, min: number, max: number): number | null {
  const number = optionalNumber(value, field, min, max);
  if (number !== null && !Number.isInteger(number)) {
    invalid(`El campo ${field} debe ser un numero entero.`);
  }
  return number;
}

export function optionalNote(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') invalid(`El campo ${field} no es valido.`);
  const trimmed = value.trim();
  if (trimmed.length > MAX_NOTE_LENGTH) {
    invalid(`La nota no puede superar ${MAX_NOTE_LENGTH} caracteres.`);
  }
  return trimmed || null;
}

function roundCoordinate(value: number) {
  return Math.round(value * 1e7) / 1e7;
}

function coordinates(record: Record<string, unknown>, label: string) {
  const lat = optionalNumber(record.lat, `${label}.lat`, -90, 90);
  const lng = optionalNumber(record.lng, `${label}.lng`, -180, 180);
  if ((lat === null) !== (lng === null)) {
    invalid(`${label}: lat y lng deben enviarse juntos.`);
  }
  return {
    lat: lat === null ? null : roundCoordinate(lat),
    lng: lng === null ? null : roundCoordinate(lng),
  };
}

export type PetIds = string[];

/** 1 a MAX_WALK_PETS UUIDs de mascota, sin repetidos. */
export function petIdsField(value: unknown, field: string): PetIds {
  if (!Array.isArray(value) || value.length === 0) {
    invalid(`El campo ${field} debe incluir al menos una mascota.`);
  }
  if (value.length > MAX_WALK_PETS) {
    invalid(`Un paseo admite como maximo ${MAX_WALK_PETS} mascotas.`);
  }
  return [...new Set(value.map((item, index) => uuidField(item, `${field}[${index}]`)))];
}

export type IncidentInput = {
  id: string;
  mascota_id: string;
  tipo: IncidentType;
  ocurrido_en: string;
  lat: number | null;
  lng: number | null;
  nota: string | null;
};

export function incidentField(value: unknown, label: string, now: number): IncidentInput {
  if (!isRecord(value)) invalid(`${label} no es un objeto valido.`);
  const tipo = value.tipo;
  if (typeof tipo !== 'string' || !(INCIDENT_TYPES as readonly string[]).includes(tipo)) {
    invalid(`${label}.tipo debe ser ${INCIDENT_TYPES.join(', ')}.`, 'INVALID_INCIDENT_TYPE');
  }
  const { lat, lng } = coordinates(value, label);
  return {
    id: uuidField(value.id, `${label}.id`),
    mascota_id: uuidField(value.mascota_id, `${label}.mascota_id`),
    tipo: tipo as IncidentType,
    ocurrido_en: dateField(value.ocurrido_en, `${label}.ocurrido_en`, now).toISOString(),
    lat,
    lng,
    nota: optionalNote(value.nota, `${label}.nota`),
  };
}

/** Lista de incidentes validada y sin ids repetidos (se conserva el primero). */
export function incidentListField(
  value: unknown,
  field: string,
  max: number,
  now: number,
  required: boolean,
): IncidentInput[] {
  if (value === undefined || value === null) {
    if (required) invalid(`El campo ${field} es obligatorio.`);
    return [];
  }
  if (!Array.isArray(value)) invalid(`El campo ${field} debe ser un arreglo.`);
  if (required && value.length === 0) invalid('Envia al menos un incidente.');
  if (value.length > max) {
    invalid(`Envia como maximo ${max} incidentes por solicitud.`, 'TOO_MANY_INCIDENTS');
  }

  const seen = new Set<string>();
  const incidents: IncidentInput[] = [];
  value.forEach((item, index) => {
    const incident = incidentField(item, `${field}[${index}]`, now);
    if (seen.has(incident.id)) return;
    seen.add(incident.id);
    incidents.push(incident);
  });
  return incidents;
}

export type RoutePoint = { lat: number; lng: number; ts?: number };

/**
 * Ruta del reloj [{lat, lng, t}] (t en milisegundos, opcional) al formato de
 * paseos.ruta [{lat, lng, ts}]. Sin puntos devuelve null (paseo sin GPS).
 */
export function routeField(value: unknown): RoutePoint[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) invalid('El campo ruta debe ser un arreglo.');
  if (value.length > MAX_ROUTE_POINTS) {
    invalid(`La ruta admite como maximo ${MAX_ROUTE_POINTS} puntos.`, 'ROUTE_TOO_LONG');
  }

  const points = value.map((item, index) => {
    const label = `ruta[${index}]`;
    if (!isRecord(item)) invalid(`${label} no es un punto valido.`);
    const lat = item.lat;
    const lng = item.lng;
    if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      invalid(`${label}.lat no es valida.`);
    }
    if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      invalid(`${label}.lng no es valida.`);
    }
    const point: RoutePoint = { lat: roundCoordinate(lat), lng: roundCoordinate(lng) };
    const time = item.t ?? item.ts;
    if (time !== undefined && time !== null) {
      if (typeof time !== 'number' || !Number.isInteger(time) || time < 0 || time > MAX_EPOCH_MS) {
        invalid(`${label}.t debe ser un tiempo en milisegundos.`);
      }
      point.ts = time;
    }
    return point;
  });
  return points.length ? points : null;
}

/**
 * Llama una función SQL del reloj. Los errores de datos (SQLSTATE 22xxx/23xxx)
 * son definitivos (400) para que el reloj no los reintente; el resto es 503.
 */
export async function callWatchRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await getAdminClient().rpc(name, args);
  if (error) {
    const code = typeof error.code === 'string' ? error.code : '';
    console.error(`[${name}] rpc error code=${code} message=${error.message ?? ''}`);
    if (/^2[23]/.test(code)) {
      throw new ApiError(400, 'INVALID_INPUT', 'Los datos enviados no son validos.');
    }
    throw new ApiError(503, 'BACKEND_NOT_READY', 'El backend seguro no esta disponible.');
  }
  if (!isRecord(data)) {
    throw new ApiError(503, 'BACKEND_NOT_READY', 'El backend seguro no esta disponible.');
  }
  return data;
}

export function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
