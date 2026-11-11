import { useEffect, useState } from 'react';

import { getDateKey } from '@/utils/dates';

/** Hora actual (ms) que se actualiza cada `intervalMs`. Evita leer el reloj durante el render. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return now;
}

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria indicada. */
export function useTodayKey(timeZone: string) {
  const now = useNow();
  return getDateKey(new Date(now), timeZone);
}
