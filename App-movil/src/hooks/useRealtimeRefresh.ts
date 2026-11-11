import { useEffect, useRef } from 'react';

import { supabase } from '@/services/supabase';

export type RealtimeTable = 'tareas_programadas' | 'incidentes' | 'paseos';

export type RealtimeSubscription = {
  table: RealtimeTable;
  /** Filtro de Realtime, por ejemplo `hogar_id=eq.<uuid>`. */
  filter?: string;
};

// Identificador único para no reutilizar canales anteriores.
let channelSequence = 0;

/**
 * Generalización de useDoseRealtimeRefresh de MedTime: escucha cambios en una o
 * varias tablas y llama a onChange agrupando ráfagas de eventos.
 * Las políticas RLS limitan los eventos a los hogares del usuario.
 */
export function useRealtimeRefresh(
  channelKey: string | null | undefined,
  subscriptions: readonly RealtimeSubscription[],
  onChange: () => void | Promise<void>,
) {
  const onChangeRef = useRef(onChange);
  const subscriptionsKey = JSON.stringify(subscriptions);

  // Mantiene actualizada la función sin recrear la suscripción.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!channelKey) return;
    const items = JSON.parse(subscriptionsKey) as RealtimeSubscription[];
    if (!items.length) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let refreshInFlight = false;
    let refreshQueued = false;
    const REFRESH_DELAY = 150;

    async function runRefresh() {
      timer = null;
      if (!active) return;
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }
      refreshInFlight = true;
      try {
        await onChangeRef.current();
      } catch {
        // La pantalla maneja los errores de actualización.
      } finally {
        refreshInFlight = false;
        if (active && refreshQueued) {
          refreshQueued = false;
          timer = setTimeout(() => {
            void runRefresh();
          }, REFRESH_DELAY);
        }
      }
    }

    function scheduleRefresh() {
      if (!active) return;
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }
      if (timer) return;
      timer = setTimeout(() => {
        void runRefresh();
      }, REFRESH_DELAY);
    }

    channelSequence += 1;
    const channel = supabase.channel(`petwatch-${channelKey}-${Date.now()}-${channelSequence}`);

    // IMPORTANTE: registrar los eventos ANTES de subscribe().
    for (const item of items) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: item.table,
          ...(item.filter ? { filter: item.filter } : {}),
        },
        scheduleRefresh,
      );
    }

    channel.subscribe((status) => {
      if (!active) return;
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[PetWatch Realtime] Error de suscripción:', status, channelKey);
      }
    });

    return () => {
      active = false;
      refreshQueued = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [channelKey, subscriptionsKey]);
}
