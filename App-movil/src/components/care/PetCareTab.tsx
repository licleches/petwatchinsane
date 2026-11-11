import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { CareCard } from '@/components/care/CareCard';
import { AppButton } from '@/components/common/AppButton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { SectionHeader } from '@/components/common/SectionHeader';
import { useFocusData } from '@/hooks/useFocusData';
import { getCaresForPet } from '@/services/cares';
import type { PetRow } from '@/types/database';
import { spacing } from '@/theme/colors';

export function PetCareTab({ pet }: { pet: PetRow }) {
  const loader = useMemo(() => () => getCaresForPet(pet.id), [pet.id]);
  const { data: cares, error, loading, refresh, refreshing } = useFocusData(loader, {
    errorMessage: 'No se pudieron cargar los cuidados.',
    resetKey: pet.id,
  });
  const addCare = () => router.push({ pathname: '/care/add', params: { petId: pet.id } });

  return (
    <View style={styles.container}>
      <SectionHeader
        action={
          pet.activa ? (
            <AppButton compact icon="add" onPress={addCare} variant="secondary">
              Agregar
            </AppButton>
          ) : null
        }
        subtitle="Comidas, medicamentos, paseos y más, con su horario."
        title="Cuidados y horarios"
      />
      {!pet.activa ? <Notice tone="warning">La mascota está archivada: sus cuidados no generan tareas.</Notice> : null}
      {loading ? <LoadingState label="Cargando cuidados..." /> : null}
      {!loading && error && !cares ? <ErrorState message={error} onRetry={() => void refresh()} retrying={refreshing} /> : null}
      {cares ? (
        <>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {cares.length ? (
            cares.map((care) => (
              <CareCard care={care} key={care.id} onPress={() => router.push({ pathname: '/care/[id]', params: { id: care.id } })} />
            ))
          ) : (
            <EmptyState
              action={pet.activa ? <AppButton onPress={addCare}>Agregar cuidado</AppButton> : undefined}
              compact
              icon="restaurant-outline"
              message="Agrega comidas, medicamentos o paseos con su horario. Se crearán las tareas de los próximos 14 días."
              title="Sin cuidados todavía"
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
