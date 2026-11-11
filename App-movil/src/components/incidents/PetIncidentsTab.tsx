import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { SectionHeader } from '@/components/common/SectionHeader';
import { IncidentCard } from '@/components/incidents/IncidentCard';
import { VetSuggestionCard } from '@/components/incidents/VetSuggestionCard';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { useFocusData } from '@/hooks/useFocusData';
import { useNow } from '@/hooks/useNow';
import { type RealtimeSubscription, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { getIncidents } from '@/services/incidents';
import type { PetRow } from '@/types/database';
import { spacing } from '@/theme/colors';
import { getVetSuggestions } from '@/utils/incidents';

export function PetIncidentsTab({ pet }: { pet: PetRow }) {
  const { user } = useSession();
  const { timeZone, getMemberName } = useHousehold();
  const now = useNow();
  const loader = useMemo(() => () => getIncidents(pet.hogar_id, { petId: pet.id }), [pet.hogar_id, pet.id]);
  const { data: incidents, error, loading, refresh, refreshing, reload } = useFocusData(loader, {
    errorMessage: 'No se pudieron cargar los incidentes.',
    resetKey: pet.id,
  });
  const subscriptions = useMemo<RealtimeSubscription[]>(() => [{ table: 'incidentes', filter: `mascota_id=eq.${pet.id}` }], [pet.id]);
  useRealtimeRefresh(`incidentes-${pet.id}`, subscriptions, reload);
  const suggestions = useMemo(() => getVetSuggestions(incidents ?? [], now), [incidents, now]);
  const addIncident = () => router.push({ pathname: '/incident/add', params: { petId: pet.id } });

  function reporterName(userId: string | null) {
    if (userId && userId === user?.id) return 'Registrado por ti';
    const name = getMemberName(userId);
    return name ? `Registrado por ${name}` : null;
  }

  return (
    <View style={styles.container}>
      <SectionHeader
        action={
          pet.activa ? (
            <AppButton compact icon="add" onPress={addIncident} variant="secondary">
              Registrar
            </AppButton>
          ) : null
        }
        subtitle="Vómito, no comió, cojea, diarrea, peleas..."
        title="Incidentes"
      />
      {suggestions.map((suggestion) => (
        <VetSuggestionCard key={`${suggestion.petId}-${suggestion.tipo}`} petName={pet.nombre} suggestion={suggestion} />
      ))}
      {loading ? <LoadingState label="Cargando incidentes..." /> : null}
      {!loading && error && !incidents ? <ErrorState message={error} onRetry={() => void refresh()} retrying={refreshing} /> : null}
      {incidents ? (
        <>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {incidents.length ? (
            incidents.map((incident) => (
              <IncidentCard
                incident={incident}
                key={incident.id}
                onPress={() => router.push({ pathname: '/incident/[id]', params: { id: incident.id } })}
                reporterName={reporterName(incident.registrado_por)}
                timeZone={timeZone}
              />
            ))
          ) : (
            <EmptyState
              action={pet.activa ? <AppButton onPress={addIncident}>Registrar incidente</AppButton> : undefined}
              compact
              icon="happy-outline"
              message="Cuando algo no ande bien, regístralo aquí. Si se repite, te sugeriremos ir al veterinario."
              title="Sin incidentes"
            />
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
});
