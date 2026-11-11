import { useEffect } from 'react';

import { describeVetSuggestion } from '@/components/incidents/VetSuggestionCard';
import { INCIDENT_TYPES } from '@/constants/options';
import { useSession } from '@/contexts/SessionContext';
import { getIncidents } from '@/services/incidents';
import { presentIncidentNotification } from '@/services/notifications';
import { getPet } from '@/services/pets';
import { getIncidentAlertsEnabled } from '@/services/preferences';
import { supabase } from '@/services/supabase';
import type { IncidentRow } from '@/types/database';
import { getVetSuggestions, getVetSuggestionWindowStart } from '@/utils/incidents';
import { isFromWatch } from '@/utils/watch';

let channelSequence = 0;

async function getReporterName(userId: string | null) {
  if (!userId) return null;
  const { data } = await supabase.from('perfiles').select('nombre').eq('id', userId).maybeSingle();
  return data?.nombre ?? null;
}

async function notifyIncident(currentUserId: string, incident: IncidentRow) {
  if (!(await getIncidentAlertsEnabled(currentUserId))) return;
  const [pet, reporter, recent] = await Promise.all([
    getPet(incident.mascota_id),
    getReporterName(incident.registrado_por),
    getIncidents(incident.hogar_id, {
      petId: incident.mascota_id,
      sinceIso: getVetSuggestionWindowStart(Date.now()),
    }),
  ]);
  if (!pet) return;

  const typeLabel = INCIDENT_TYPES[incident.tipo]?.label ?? 'Incidente';
  const suggestion = getVetSuggestions(recent, Date.now()).find((item) => item.tipo === incident.tipo);
  const source = isFromWatch(incident) ? ' desde el reloj ⌚' : '';
  const note = incident.nota ? ` "${incident.nota}"` : '';
  const body = `Registrado por ${reporter ?? 'un miembro del hogar'}${source}.${note}${suggestion ? ` ${describeVetSuggestion(suggestion, pet.nombre)}` : ''}`;

  await presentIncidentNotification({
    title: `${pet.nombre}: ${typeLabel}`,
    body,
    data: { petId: pet.id, incidentId: incident.id, householdId: incident.hogar_id },
  });
}

/**
 * Aviso en tiempo real a los demás miembros: escucha los INSERT de incidentes
 * (RLS limita los eventos a los hogares del usuario) y muestra una notificación
 * local. En Expo Go funciona mientras la app está abierta o en segundo plano
 * reciente; el push con la app cerrada llegará en la fase del reloj.
 */
export function IncidentAlertController() {
  const { user } = useSession();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    channelSequence += 1;
    const channel = supabase.channel(`petwatch-avisos-incidentes-${userId}-${Date.now()}-${channelSequence}`);

    channel.on<IncidentRow>('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incidentes' }, (payload) => {
      const incident = payload.new;
      if (!active || !incident?.id || incident.registrado_por === userId) return;
      void notifyIncident(userId, incident).catch((error: unknown) => {
        if (process.env.NODE_ENV !== 'production') console.warn('[PetWatch] No se pudo avisar del incidente', error);
      });
    });

    channel.subscribe((status) => {
      if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
        console.warn('[PetWatch Realtime] Error de suscripción a incidentes:', status);
      }
    });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return null;
}
