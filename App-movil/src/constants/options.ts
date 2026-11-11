import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { colors } from '@/theme/colors';
import type { CareType, IncidentType, PetSex, Species, TaskStatus } from '@/types/database';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export const DEFAULT_TIME_ZONE = 'America/Hermosillo';

export const TIME_ZONE_OPTIONS = [
  { label: 'Sonora', value: 'America/Hermosillo' },
  { label: 'Baja California', value: 'America/Tijuana' },
  { label: 'Sinaloa', value: 'America/Mazatlan' },
  { label: 'Chihuahua', value: 'America/Chihuahua' },
  { label: 'Ciudad de México', value: 'America/Mexico_City' },
  { label: 'Nuevo León', value: 'America/Monterrey' },
  { label: 'Quintana Roo', value: 'America/Cancun' },
  { label: 'UTC', value: 'Etc/UTC' },
] as const;

export function getDetectedTimeZone() {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIME_ZONE_OPTIONS.some((option) => option.value === detected) ? detected : DEFAULT_TIME_ZONE;
}

export function getConfiguredTimeZone(value?: string | null) {
  return TIME_ZONE_OPTIONS.some((option) => option.value === value) ? value! : getDetectedTimeZone();
}

export function isSupportedTimeZone(value: string) {
  return TIME_ZONE_OPTIONS.some((option) => option.value === value);
}

export const SPECIES_LABELS: Record<Species, string> = {
  perro: 'Perro',
  gato: 'Gato',
  ave: 'Ave',
  conejo: 'Conejo',
  roedor: 'Roedor',
  reptil: 'Reptil',
  pez: 'Pez',
  otro: 'Otro',
};

export const SPECIES_OPTIONS = (Object.keys(SPECIES_LABELS) as Species[]).map((value) => ({
  label: SPECIES_LABELS[value],
  value,
}));

export function getSpeciesIcon(species: Species): IconName {
  return species === 'pez' ? 'fish-outline' : 'paw';
}

export const SEX_LABELS: Record<PetSex, string> = {
  macho: 'Macho',
  hembra: 'Hembra',
};

export const SEX_OPTIONS = [
  { label: 'Sin especificar', value: '' },
  { label: 'Macho', value: 'macho' },
  { label: 'Hembra', value: 'hembra' },
] as const;

type CareTypeInfo = {
  label: string;
  icon: IconName;
  color: string;
  soft: string;
  defaultName: string;
  namePlaceholder: string;
  detailPlaceholder: string;
};

export const CARE_TYPES: Record<CareType, CareTypeInfo> = {
  comida: {
    label: 'Comida',
    icon: 'restaurant-outline',
    color: colors.primary,
    soft: colors.softPrimary,
    defaultName: 'Comida',
    namePlaceholder: 'Ej. Desayuno',
    detailPlaceholder: 'Ej. 1 taza de croquetas',
  },
  medicamento: {
    label: 'Medicamento',
    icon: 'medkit-outline',
    color: colors.blue,
    soft: colors.blueSoft,
    defaultName: 'Medicamento',
    namePlaceholder: 'Ej. Desparasitante',
    detailPlaceholder: 'Ej. 1/2 tableta con comida',
  },
  paseo: {
    label: 'Paseo',
    icon: 'walk-outline',
    color: colors.green,
    soft: colors.greenSoft,
    defaultName: 'Paseo',
    namePlaceholder: 'Ej. Paseo de la mañana',
    detailPlaceholder: 'Ej. 30 minutos por el parque',
  },
  otro: {
    label: 'Otro',
    icon: 'ellipsis-horizontal-circle-outline',
    color: colors.violet,
    soft: colors.violetSoft,
    defaultName: '',
    namePlaceholder: 'Ej. Cepillado',
    detailPlaceholder: 'Ej. Usar el cepillo suave',
  },
};

export const CARE_TYPE_ORDER: readonly CareType[] = ['comida', 'medicamento', 'paseo', 'otro'];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  hecha: 'Hecha',
  pospuesta: 'Pospuesta',
  omitida: 'Omitida',
};

export const INCIDENT_TYPES: Record<IncidentType, { label: string; icon: IconName }> = {
  vomito: { label: 'Vomitó', icon: 'sad-outline' },
  no_comio: { label: 'No comió', icon: 'restaurant-outline' },
  cojea: { label: 'Cojea', icon: 'bandage-outline' },
  diarrea: { label: 'Diarrea', icon: 'water-outline' },
  pelea: { label: 'Se peleó', icon: 'flash-outline' },
  otro: { label: 'Otro', icon: 'alert-circle-outline' },
};

export const INCIDENT_TYPE_ORDER: readonly IncidentType[] = ['vomito', 'no_comio', 'cojea', 'diarrea', 'pelea', 'otro'];

export const POSTPONE_OPTIONS = [
  { label: '15 minutos', minutes: 15 },
  { label: '30 minutos', minutes: 30 },
  { label: '1 hora', minutes: 60 },
  { label: '2 horas', minutes: 120 },
] as const;

/** Días hacia adelante para los que se generan tareas (igual que las dosis de MedTime). */
export const TASK_GENERATION_DAYS = 14;

/** Regla de incidentes: este número del mismo tipo en la ventana sugiere ir al veterinario. */
export const VET_SUGGESTION_MIN_INCIDENTS = 3;
export const VET_SUGGESTION_WINDOW_DAYS = 7;

/** Una vacuna se marca como "próxima" cuando faltan estos días o menos. */
export const VACCINE_UPCOMING_DAYS = 30;
