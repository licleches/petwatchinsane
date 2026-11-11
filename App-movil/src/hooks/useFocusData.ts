import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getErrorMessage } from '@/utils/errors';

type Keyed<T> = { key: string; value: T };

/**
 * Carga datos cada vez que la pantalla recibe el foco (patrón de MedTime con
 * useFocusEffect + versión de carga). Mantiene los datos anteriores al recargar
 * y solo muestra "cargando" la primera vez o cuando cambia `resetKey`
 * (por ejemplo, otro hogar u otra mascota).
 */
export function useFocusData<T>(
  loader: (() => Promise<T>) | null,
  { errorMessage, resetKey = 'default' }: { errorMessage: string; resetKey?: string },
) {
  const [loaded, setLoaded] = useState<Keyed<T> | null>(null);
  const [failure, setFailure] = useState<Keyed<string> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const version = useRef(0);

  const run = useCallback(
    async (showRefreshing: boolean) => {
      if (!loader) return;
      const current = version.current + 1;
      version.current = current;
      if (showRefreshing) setRefreshing(true);
      try {
        const value = await loader();
        if (current !== version.current) return;
        setLoaded({ key: resetKey, value });
        setFailure(null);
      } catch (error) {
        if (current !== version.current) return;
        setFailure({ key: resetKey, value: getErrorMessage(error, errorMessage) });
      } finally {
        if (current === version.current) setRefreshing(false);
      }
    },
    [errorMessage, loader, resetKey],
  );

  useFocusEffect(
    useCallback(() => {
      void run(false);
      return () => {
        // Descarta respuestas que lleguen cuando la pantalla ya no está enfocada.
        version.current += 1;
      };
    }, [run]),
  );

  const data = loaded && loaded.key === resetKey ? loaded.value : undefined;
  const error = failure && failure.key === resetKey ? failure.value : null;
  const loading = Boolean(loader) && data === undefined && error === null;

  const refresh = useCallback(() => run(true), [run]);
  const reload = useCallback(() => run(false), [run]);

  return { data, error, loading, refreshing, refresh, reload };
}
