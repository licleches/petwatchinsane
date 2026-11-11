import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { AppScreen } from '@/components/common/AppScreen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { LoadingScreen, UnavailableScreen } from '@/components/common/ScreenStates';
import { VetVisitForm } from '@/components/health/VetVisitForm';
import { useFocusData } from '@/hooks/useFocusData';
import { useSaving } from '@/hooks/useSaving';
import { getPet } from '@/services/pets';
import { createVisit, type VetVisitInput } from '@/services/vetVisits';

export default function AddVetVisitScreen() {
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
        title="Nueva visita"
      />
    );
  }

  function handleSubmit(input: VetVisitInput) {
    if (!pet) return Promise.resolve();
    return run(async () => {
      await createVisit(pet.id, input);
      router.back();
    }, 'No se pudo guardar la visita');
  }

  return (
    <AppScreen>
      <ScreenHeader back subtitle={`Para ${pet.nombre}`} title="Nueva visita" />
      <VetVisitForm loading={saving} onCancel={() => router.back()} onSubmit={handleSubmit} submitLabel="Guardar visita" />
    </AppScreen>
  );
}
