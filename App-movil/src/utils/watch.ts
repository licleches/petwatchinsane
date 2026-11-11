export const WATCH_ORIGIN_LABEL = 'Registrado desde el reloj ⌚';

/**
 * true si el registro vino del smartwatch. Paseos e incidentes tienen `origen`;
 * las tareas solo `dispositivo_id` (el reloj que hizo el último cambio).
 */
export function isFromWatch(record: { origen?: string | null; dispositivo_id?: string | null }) {
  return record.origen === 'reloj' || Boolean(record.dispositivo_id);
}
