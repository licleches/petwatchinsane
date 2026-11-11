import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { EmptyState } from '@/components/common/EmptyState';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { LoadingScreen, UnavailableScreen } from '@/components/common/ScreenStates';
import { ManualWalkForm, type ManualWalkValues } from '@/components/walks/ManualWalkForm';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useFocusData } from '@/hooks/useFocusData';
import { useSaving } from '@/hooks/useSaving';
import { getPets } from '@/services/pets';
import { registerManualWalk } from '@/services/walks';
import { newId } from '@/utils/ids';

export default function AddWalkScreen() {
  const { petId } = useLocalSearchParams<{ petId?: string }>();
  const { household } = useHousehold();
  const householdId = household?.id ?? null;
  // El mismo id en reintentos de esta pantalla: si la red falla, no se duplica.
  const [walkId] = useState(() => newId());
  const loader = useMemo(() => (householdId ? async () => (await getPets(householdId)).filter((pet) => pet.activa) : null), [householdId]);
  const { data: pets, error, loading, refresh, refreshing } = useFocusData(loader, {
    errorMessage: 'No se pudieron cargar las mascotas.',
    resetKey: householdId ?? 'sin-hogar',
  });
  const { saving, run } = useSaving();

  if (loading) return <LoadingScreen />;
  if (!pets || !householdId) {
    return (
      <UnavailableScreen
        error={error}
        message="No hay un hogar activo."
        onRetry={() => void refresh()}
        retrying={refreshing}
        title="Registrar paseo"
      />
    );
  }

  function handleSubmit(values: ManualWalkValues) {
    if (!householdId) return Promise.resolve();
    return run(async () => {
      await registerManualWalk({ id: walkId, householdId, ...values });
      router.back();
    }, 'No se pudo guardar el paseo');
  }

  return (
    <AppScreen>
      <ScreenHeader back subtitle="Paseo manual, sin ruta GPS." title="Registrar paseo" />
      {pets.length ? (
        <ManualWalkForm
          initialPetIds={typeof petId === 'string' ? [petId] : []}
          loading={saving}
          onCancel={() => router.back()}
          onSubmit={handleSubmit}
          pets={pets}
        />
      ) : (
        <EmptyState
          action={<AppButton onPress={() => router.replace('/pet/add')}>Agregar mascota</AppButton>}
          message="Primero agrega una mascota activa a tu hogar."
          title="Sin mascotas"
        />
      )}
    </AppScreen>
  );
}
