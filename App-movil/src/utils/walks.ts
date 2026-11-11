import type { RoutePoint, WalkRow } from '@/types/database';
import { addDays, getDateKey, getWeekStartKey } from '@/utils/dates';

export type Coordinate = { latitude: number; longitude: number };
export type MapRegion = Coordinate & { latitudeDelta: number; longitudeDelta: number };
export type WeeklyMinutes = { weekStart: string; minutes: number };

const EARTH_RADIUS_M = 6_371_000;

/** Minutos caminados por semana (lunes a domingo) en las últimas `weeks` semanas, incluida la actual. */
export function getWeeklyWalkMinutes(
  walks: Pick<WalkRow, 'iniciado_en' | 'duracion_seg'>[],
  todayKey: string,
  timeZone: string,
  weeks = 8,
): WeeklyMinutes[] {
  const currentWeek = getWeekStartKey(todayKey);
  const starts = Array.from({ length: weeks }, (_, index) => addDays(currentWeek, -7 * (weeks - 1 - index)));
  const totals = new Map(starts.map((start) => [start, 0]));

  for (const walk of walks) {
    const date = new Date(walk.iniciado_en);
    if (!Number.isFinite(date.getTime())) continue;
    const week = getWeekStartKey(getDateKey(date, timeZone));
    const current = totals.get(week);
    if (current !== undefined) totals.set(week, current + Math.max(0, walk.duracion_seg) / 60);
  }

  return starts.map((weekStart) => ({ weekStart, minutes: Math.round(totals.get(weekStart) ?? 0) }));
}

/** Puntos válidos de la ruta para el mapa (descarta coordenadas fuera de rango). */
export function getRouteCoordinates(route: RoutePoint[] | null | undefined): Coordinate[] {
  if (!Array.isArray(route)) return [];
  return route
    .filter(
      (point) =>
        point &&
        typeof point.lat === 'number' &&
        typeof point.lng === 'number' &&
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lng) &&
        Math.abs(point.lat) <= 90 &&
        Math.abs(point.lng) <= 180,
    )
    .map((point) => ({ latitude: point.lat, longitude: point.lng }));
}

/** Región del mapa que encuadra todos los puntos con un margen. */
export function getRegionForCoordinates(coordinates: Coordinate[]): MapRegion | null {
  if (!coordinates.length) return null;
  let minLat = coordinates[0].latitude;
  let maxLat = coordinates[0].latitude;
  let minLng = coordinates[0].longitude;
  let maxLng = coordinates[0].longitude;
  for (const coordinate of coordinates) {
    minLat = Math.min(minLat, coordinate.latitude);
    maxLat = Math.max(maxLat, coordinate.latitude);
    minLng = Math.min(minLng, coordinate.longitude);
    maxLng = Math.max(maxLng, coordinate.longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.004),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.004),
  };
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

/** Distancia total de la ruta en metros (fórmula de haversine). */
export function getRouteDistanceMeters(coordinates: Coordinate[]) {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const from = coordinates[index - 1];
    const to = coordinates[index];
    const dLat = toRadians(to.latitude - from.latitude);
    const dLng = toRadians(to.longitude - from.longitude);
    const a =
      Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLng / 2) ** 2;
    total += 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return total;
}

/** "850 m" o "1.2 km". */
export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 2 : 1)} km`;
}

export function formatSteps(steps: number) {
  return `${new Intl.NumberFormat('es-MX').format(steps)} pasos`;
}
