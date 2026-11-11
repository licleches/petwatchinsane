import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { LoadingScreen, UnavailableScreen } from '@/components/common/ScreenStates';
import { VetVisitForm } from '@/components/health/VetVisitForm';
import { useFocusData } from '@/hooks/useFocusData';
import { useSaving } from '@/hooks/useSaving';
import { getPet } from '@/services/pets';
import { deleteVisit, getVisit, updateVisit, type VetVisitInput } from '@/services/vetVisits';
import { colors, spacing } from '@/theme/colors';
import { formatDateForDisplay } from '@/utils/dates';

export default function EditVetVisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const visitId = typeof id === 'string' ? id : null;
  const loader = useMemo(
    () =>
      visitId
        ? async () => {
            const visit = await getVisit(visitId);
            if (!visit) return null;
            const pet = await getPet(visit.mascota_id);
            return pet ? { visit, pet } : null;
          }
        : null,
    [visitId],
  );
  const { data, error, loading, refresh, refreshing } = useFocusData(loader, {
    errorMessage: 'No se pudo cargar la visita.',
    resetKey: visitId ?? 'sin-id',
  });
  const { saving, run } = useSaving();

  if (loading) return <LoadingScreen />;
  if (!data) {
    return (
      <UnavailableScreen
        error={error}
        message="No encontramos esta visita. Puede que otro miembro la haya eliminado."
        onRetry={() => void refresh()}
        retrying={refreshing}
        title="Visita al veterinario"
      />
    );
  }

  const { visit, pet } = data;

  function handleSubmit(input: VetVisitInput) {
    return run(async () => {
      await updateVisit(visit.id, input);
      router.back();
    }, 'No se pudo guardar la visita');
  }

  function confirmDelete() {
    Alert.alert('Eliminar visita', `¿Eliminar la visita del ${formatDateForDisplay(visit.fecha)}? Esta acción no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await deleteVisit(visit.id);
            router.back();
          }, 'No se pudo eliminar'),
      },
    ]);
  }

  return (
    <AppScreen>
      <ScreenHeader back subtitle={`${visit.motivo} · ${pet.nombre}`} title="Visita al veterinario" />
      <VetVisitForm initial={visit} key={visit.id} loading={saving} onCancel={() => router.back()} onSubmit={handleSubmit} submitLabel="Guardar cambios" />
      <View style={styles.danger}>
        <AppButton disabled={saving} icon="trash-outline" onPress={confirmDelete} variant="danger">
          Eliminar visita
        </AppButton>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  danger: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.sm, paddingTop: spacing.lg },
});
