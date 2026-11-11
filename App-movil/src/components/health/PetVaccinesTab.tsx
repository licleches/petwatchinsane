import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { SectionHeader } from '@/components/common/SectionHeader';
import { VaccineCard } from '@/components/health/VaccineCard';
import { useFocusData } from '@/hooks/useFocusData';
import { getVaccinesForPet } from '@/services/vaccines';
import type { PetRow } from '@/types/database';
import { spacing } from '@/theme/colors';
import { getVaccineStatuses, sortVaccinesByStatus } from '@/utils/vaccines';

export function PetVaccinesTab({ pet, todayKey }: { pet: PetRow; todayKey: string }) {
  const loader = useMemo(() => () => getVaccinesForPet(pet.id), [pet.id]);
  const { data: vaccines, error, loading, refresh, refreshing } = useFocusData(loader, {
    errorMessage: 'No se pudieron cargar las vacunas.',
    resetKey: pet.id,
  });
  const statuses = useMemo(() => getVaccineStatuses(vaccines ?? [], todayKey), [todayKey, vaccines]);
  const sorted = useMemo(() => sortVaccinesByStatus(vaccines ?? [], statuses), [statuses, vaccines]);
  const overdue = sorted.filter((vaccine) => statuses.get(vaccine.id)?.status === 'vencida');
  const upcoming = sorted.filter((vaccine) => statuses.get(vaccine.id)?.status === 'proxima');
  const addVaccine = () => router.push({ pathname: '/vaccine/add', params: { petId: pet.id } });

  return (
    <View style={styles.container}>
      <SectionHeader
        action={
          <AppButton compact icon="add" onPress={addVaccine} variant="secondary">
            Agregar
          </AppButton>
        }
        subtitle="Se resaltan las próximas (30 días) y las vencidas."
        title="Vacunas"
      />
      {loading ? <LoadingState label="Cargando vacunas..." /> : null}
      {!loading && error && !vaccines ? <ErrorState message={error} onRetry={() => void refresh()} retrying={refreshing} /> : null}
      {vaccines ? (
        <>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {overdue.length ? (
            <Notice tone="error">
              {overdue.length === 1 ? `La vacuna ${overdue[0].nombre} está vencida.` : `${overdue.length} vacunas están vencidas.`} Agenda una visita al veterinario.
            </Notice>
          ) : null}
          {upcoming.length ? (
            <Notice tone="warning">
              {upcoming.length === 1 ? `La vacuna ${upcoming[0].nombre} toca pronto.` : `${upcoming.length} vacunas tocan en los próximos 30 días.`}
            </Notice>
          ) : null}
          {sorted.length ? (
            sorted.map((vaccine) => (
              <VaccineCard
                info={statuses.get(vaccine.id) ?? { status: 'historial', daysUntil: null }}
                key={vaccine.id}
                onPress={() => router.push({ pathname: '/vaccine/[id]', params: { id: vaccine.id } })}
                vaccine={vaccine}
              />
            ))
          ) : (
            <EmptyState
              action={<AppButton onPress={addVaccine}>Registrar vacuna</AppButton>}
              compact
              icon="medical-outline"
              message="Registra las vacunas aplicadas y su próxima dosis para no olvidar ningún refuerzo."
              title="Sin vacunas registradas"
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
