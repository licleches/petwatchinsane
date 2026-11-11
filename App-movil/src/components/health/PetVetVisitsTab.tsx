import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { SectionHeader } from '@/components/common/SectionHeader';
import { VetVisitCard } from '@/components/health/VetVisitCard';
import { useFocusData } from '@/hooks/useFocusData';
import { formatCost, getVisitsForPet } from '@/services/vetVisits';
import type { PetRow } from '@/types/database';
import { spacing } from '@/theme/colors';

export function PetVetVisitsTab({ pet }: { pet: PetRow }) {
  const loader = useMemo(() => () => getVisitsForPet(pet.id), [pet.id]);
  const { data: visits, error, loading, refresh, refreshing } = useFocusData(loader, {
    errorMessage: 'No se pudieron cargar las visitas.',
    resetKey: pet.id,
  });
  const total = (visits ?? []).reduce((sum, visit) => sum + (visit.costo ?? 0), 0);
  const addVisit = () => router.push({ pathname: '/vet-visit/add', params: { petId: pet.id } });

  return (
    <View style={styles.container}>
      <SectionHeader
        action={
          <AppButton compact icon="add" onPress={addVisit} variant="secondary">
            Agregar
          </AppButton>
        }
        subtitle={visits?.length && total > 0 ? `Gasto registrado: ${formatCost(total)}` : 'Consultas, diagnósticos y tratamientos.'}
        title="Visitas al veterinario"
      />
      {loading ? <LoadingState label="Cargando visitas..." /> : null}
      {!loading && error && !visits ? <ErrorState message={error} onRetry={() => void refresh()} retrying={refreshing} /> : null}
      {visits ? (
        <>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {visits.length ? (
            visits.map((visit) => (
              <VetVisitCard key={visit.id} onPress={() => router.push({ pathname: '/vet-visit/[id]', params: { id: visit.id } })} visit={visit} />
            ))
          ) : (
            <EmptyState
              action={<AppButton onPress={addVisit}>Registrar visita</AppButton>}
              compact
              icon="medkit-outline"
              message="Guarda cada consulta con su diagnóstico, tratamiento y costo."
              title="Sin visitas registradas"
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
