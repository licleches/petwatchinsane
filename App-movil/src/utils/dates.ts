export const weekdayLabels = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
export const weekdayNames = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];
export const weekdayShortNames = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const DAY_MS = 86_400_000;

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function partsFromFormat(date: Date, timeZone?: string): DateParts {
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
    );
    return {
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
      second: values.second,
    };
  } catch {
    return partsFromFormat(date);
  }
}

export function getDeviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function getSafeTimeZone(timeZone?: string | null) {
  if (!timeZone) return getDeviceTimeZone();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return timeZone;
  } catch {
    return getDeviceTimeZone();
  }
}

export function getDateKey(date = new Date(), timeZone = getDeviceTimeZone()) {
  const parts = partsFromFormat(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function addDays(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function getDateKeys(startDateKey: string, amount: number) {
  return Array.from({ length: amount }, (_, index) => addDays(startDateKey, index));
}

export function getWeekday(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Lunes de la semana a la que pertenece la fecha. */
export function getWeekStartKey(dateKey: string) {
  return addDays(dateKey, -((getWeekday(dateKey) + 6) % 7));
}

export function diffInDays(fromDateKey: string, toDateKey: string) {
  const [fromYear, fromMonth, fromDay] = fromDateKey.split('-').map(Number);
  const [toYear, toMonth, toDay] = toDateKey.split('-').map(Number);
  return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / DAY_MS);
}

export function dateForTimeZone(dateKey: string, time: string, timeZone = getDeviceTimeZone()) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const safeHour = Number.isFinite(hour) ? hour : 0;
  const safeMinute = Number.isFinite(minute) ? minute : 0;

  if (!timeZone) {
    return new Date(year, month - 1, day, safeHour, safeMinute, 0, 0);
  }

  try {
    const guess = new Date(Date.UTC(year, month - 1, day, safeHour, safeMinute, 0, 0));
    const local = partsFromFormat(guess, timeZone);
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour ?? 0,
      local.minute ?? 0,
      local.second ?? 0,
    );
    return new Date(guess.getTime() - (localAsUtc - guess.getTime()));
  } catch {
    return new Date(year, month - 1, day, safeHour, safeMinute, 0, 0);
  }
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export function formatLongDate(dateKey: string, timeZone = getDeviceTimeZone()) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'long',
    timeZone,
  }).format(dateForTimeZone(dateKey, '12:00', timeZone));
}

/** "Sábado, 8 de noviembre". */
export function formatDayHeading(dateKey: string, timeZone = getDeviceTimeZone()) {
  return capitalize(
    new Intl.DateTimeFormat('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone,
    }).format(dateForTimeZone(dateKey, '12:00', timeZone)),
  );
}

export function formatShortDate(dateKey: string, timeZone = getDeviceTimeZone()) {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    timeZone,
  })
    .format(dateForTimeZone(dateKey, '12:00', timeZone))
    .replace('.', '');
}

/** "8 nov". */
export function formatDayMonth(dateKey: string) {
  const [, month, day] = dateKey.split('-').map(Number);
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${day} ${months[month - 1] ?? ''}`.trim();
}

export function formatTime(value: string, timeZone = getDeviceTimeZone()) {
  if (/^\d{1,2}:\d{2}/.test(value)) {
    return value.slice(0, 5);
  }

  try {
    return new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

/** "8 nov 2026 · 08:30" en la zona indicada. */
export function formatDateTime(value: string, timeZone = getDeviceTimeZone()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const dateKey = getDateKey(date, timeZone);
  return `${formatDateForDisplay(dateKey)} · ${formatTime(value, timeZone)}`;
}

export function normalizeDate(value: string) {
  return value.slice(0, 10);
}

export function dateKeyFromLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateFromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/** Edad máxima aceptada para la fecha de nacimiento de una mascota. */
export const PET_MAX_AGE_YEARS = 20;

/** Fecha de nacimiento más antigua permitida: hoy menos PET_MAX_AGE_YEARS años. */
export function minPetBirthDate(today: Date) {
  return new Date(today.getFullYear() - PET_MAX_AGE_YEARS, today.getMonth(), today.getDate(), 12, 0, 0, 0);
}

export function addCalendarMonths(date: Date, amount: number) {
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay), 12, 0, 0, 0);
}

export function formatDateForDisplay(dateKey: string) {
  const [year, month, day] = dateKey.split('-');
  return `${day}/${month}/${year}`;
}

export function normalizeTime(value: string) {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

export function dateFromTime(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return new Date(2000, 0, 1, hour || 0, minute || 0, 0, 0);
}

export function timeFromDate(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`;
}

export function formatTime12(value: string | Date) {
  const date = typeof value === 'string' ? dateFromTime(value) : value;
  return new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/** Une la fecha de un selector con la hora de otro (ambos en hora local del dispositivo). */
export function combineDateAndTime(date: Date, time: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes(), 0, 0);
}

/** "45 min", "1 h", "1 h 20 min". */
export function formatDuration(totalSeconds: number) {
  const minutes = Math.max(0, Math.round(totalSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Edad legible a partir de la fecha de nacimiento (YYYY-MM-DD). */
export function formatAge(birthDateKey: string, todayKey: string) {
  const [birthYear, birthMonth, birthDay] = birthDateKey.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = todayKey.split('-').map(Number);
  let months = (todayYear - birthYear) * 12 + (todayMonth - birthMonth);
  if (todayDay < birthDay) months -= 1;
  if (months < 0) return null;
  if (months < 1) {
    const days = Math.max(0, diffInDays(birthDateKey, todayKey));
    return `${days} ${days === 1 ? 'día' : 'días'}`;
  }
  if (months < 12) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? 'año' : 'años'}`;
}

/** "Hoy", "Ayer" o la fecha con día de la semana. */
export function formatRelativeDay(dateKey: string, todayKey: string, timeZone = getDeviceTimeZone()) {
  const difference = diffInDays(dateKey, todayKey);
  if (difference === 0) return 'Hoy';
  if (difference === 1) return 'Ayer';
  if (difference === -1) return 'Mañana';
  return formatDayHeading(dateKey, timeZone);
}
