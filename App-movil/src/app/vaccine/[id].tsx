import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { LoadingScreen, UnavailableScreen } from '@/components/common/ScreenStates';
import { VaccineForm } from '@/components/health/VaccineForm';
import { useFocusData } from '@/hooks/useFocusData';
import { useSaving } from '@/hooks/useSaving';
import { getPet } from '@/services/pets';
import { deleteVaccine, getVaccine, updateVaccine, type VaccineInput } from '@/services/vaccines';
import { colors, spacing } from '@/theme/colors';

export default function EditVaccineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vaccineId = typeof id === 'string' ? id : null;
  const loader = useMemo(
    () =>
      vaccineId
        ? async () => {
            const vaccine = await getVaccine(vaccineId);
            if (!vaccine) return null;
            const pet = await getPet(vaccine.mascota_id);
            return pet ? { vaccine, pet } : null;
          }
        : null,
    [vaccineId],
  );
  const { data, error, loading, refresh, refreshing } = useFocusData(loader, {
    errorMessage: 'No se pudo cargar la vacuna.',
    resetKey: vaccineId ?? 'sin-id',
  });
  const { saving, run } = useSaving();

  if (loading) return <LoadingScreen />;
  if (!data) {
    return (
      <UnavailableScreen
        error={error}
        message="No encontramos esta vacuna. Puede que otro miembro la haya eliminado."
        onRetry={() => void refresh()}
        retrying={refreshing}
        title="Vacuna"
      />
    );
  }

  const { vaccine, pet } = data;

  function handleSubmit(input: VaccineInput) {
    return run(async () => {
      await updateVaccine(vaccine.id, input);
      router.back();
    }, 'No se pudo guardar la vacuna');
  }

  function confirmDelete() {
    Alert.alert('Eliminar vacuna', `¿Eliminar el registro de ${vaccine.nombre}? Esta acción no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await deleteVaccine(vaccine.id);
            router.back();
          }, 'No se pudo eliminar'),
      },
    ]);
  }

  return (
    <AppScreen>
      <ScreenHeader back subtitle={`${vaccine.nombre} · ${pet.nombre}`} title="Editar vacuna" />
      <VaccineForm initial={vaccine} key={vaccine.id} loading={saving} onCancel={() => router.back()} onSubmit={handleSubmit} submitLabel="Guardar cambios" />
      <View style={styles.danger}>
        <AppButton disabled={saving} icon="trash-outline" onPress={confirmDelete} variant="danger">
          Eliminar vacuna
        </AppButton>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  danger: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.sm, paddingTop: spacing.lg },
});
