export function isValidEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

/** Devuelve el texto recortado o null si queda vacío. */
export function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

/** Deja solo dígitos y un separador decimal (acepta coma o punto). */
export function sanitizeDecimalInput(value: string, decimals = 2) {
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '');
  const [integerPart, ...rest] = normalized.split('.');
  if (!rest.length) return integerPart.slice(0, 7);
  return `${integerPart.slice(0, 7)}.${rest.join('').slice(0, decimals)}`;
}

export function sanitizeIntegerInput(value: string, maxLength = 6) {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

/** undefined = texto inválido, null = vacío, number = valor. */
export function parseDecimalInput(value: string): number | null | undefined {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseIntegerInput(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

const INVITE_CODE_LENGTH = 8;

/** Mayúsculas y sin guiones ni espacios: "abcd-2345" -> "ABCD2345". */
export function normalizeInviteCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, INVITE_CODE_LENGTH);
}

export function isValidInviteCode(value: string) {
  return normalizeInviteCode(value).length === INVITE_CODE_LENGTH;
}

/** "ABCD2345" -> "ABCD-2345". */
export function formatInviteCode(code: string) {
  const normalized = normalizeInviteCode(code);
  return normalized.length > 4 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized;
}
