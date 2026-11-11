import type { PostgrestError } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;

/**
 * Lee todas las filas de una consulta por páginas. Supabase devuelve como máximo
 * 1000 filas por petición, así que historiales largos se leen en varias partes.
 */
export async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  maxRows = 10_000,
) {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Ejecuta una consulta `.in(...)` por grupos de ids para no exceder el largo
 * máximo de la URL de PostgREST.
 */
export async function selectInChunks<T>(
  ids: string[],
  build: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  chunkSize = 100,
) {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    const { data, error } = await build(ids.slice(index, index + chunkSize));
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

export function uniqueIds(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
