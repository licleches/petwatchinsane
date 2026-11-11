import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { AppScreen } from '@/components/common/AppScreen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { LoadingScreen, UnavailableScreen } from '@/components/common/ScreenStates';
import { VaccineForm } from '@/components/health/VaccineForm';
import { useFocusData } from '@/hooks/useFocusData';
import { useSaving } from '@/hooks/useSaving';
import { getPet } from '@/services/pets';
import { createVaccine, type VaccineInput } from '@/services/vaccines';

export default function AddVaccineScreen() {
  const { petId } = useLocalSearchParams<{ petId?: string }>();
  const id = typeof petId === 'string' ? petId : null;
  const loader = useMemo(() => (id ? () => getPet(id) : null), [id]);
  const { data: pet, error, loading, refresh, refreshing } = useFocusData(loader, {
    errorMessage: 'No se pudo cargar la mascota.',
    resetKey: id ?? 'sin-id',
  });
  const { saving, run } = useSaving();

  if (loading) return <LoadingScreen />;
  if (!pet) {
    return (
      <UnavailableScreen
        error={error}
        message="No encontramos esta mascota."
        onRetry={() => void refresh()}
        retrying={refreshing}
        title="Nueva vacuna"
      />
    );
  }

  function handleSubmit(input: VaccineInput) {
    if (!pet) return Promise.resolve();
    return run(async () => {
      await createVaccine(pet.id, input);
      router.back();
    }, 'No se pudo guardar la vacuna');
  }

  return (
    <AppScreen>
      <ScreenHeader back subtitle={`Para ${pet.nombre}`} title="Nueva vacuna" />
      <VaccineForm loading={saving} onCancel={() => router.back()} onSubmit={handleSubmit} submitLabel="Guardar vacuna" />
    </AppScreen>
  );
}
