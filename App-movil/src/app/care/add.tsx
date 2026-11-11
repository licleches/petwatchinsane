import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { CareForm } from '@/components/care/CareForm';
import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { useFocusData } from '@/hooks/useFocusData';
import { type CareInput, saveCare } from '@/services/cares';
import { requestTaskNotificationSync } from '@/services/notifications';
import { getPet } from '@/services/pets';
import { getErrorMessage } from '@/utils/errors';

export default function AddCareScreen() {
  const { petId } = useLocalSearchParams<{ petId?: string }>();
  const id = typeof petId === 'string' ? petId : null;
  const { user } = useSession();
  const { households } = useHousehold();
  const loader = useMemo(() => (id ? () => getPet(id) : null), [id]);
  const { data: pet, error, loading, refresh, refreshing } = useFocusData(loader, {
    errorMessage: 'No se pudo cargar la mascota.',
    resetKey: id ?? 'sin-id',
  });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function handleSubmit(input: CareInput) {
    if (!pet || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await saveCare(pet.id, pet.hogar_id, input, null);
      if (user) requestTaskNotificationSync(user.id, households);
      router.back();
    } catch (saveError) {
      Alert.alert('No se pudo guardar', getErrorMessage(saveError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppScreen scroll={false}>
        <LoadingState />
      </AppScreen>
    );
  }
  if (!pet || !pet.activa) {
    return (
      <AppScreen>
        <ScreenHeader back title="Nuevo cuidado" />
        {error ? (
          <ErrorState message={error} onRetry={() => void refresh()} retrying={refreshing} />
        ) : (
          <EmptyState
            action={<AppButton onPress={() => router.back()}>Volver</AppButton>}
            message={pet ? 'La mascota está archivada. Reactívala para agregarle cuidados.' : 'No encontramos esta mascota.'}
            title="No se puede agregar el cuidado"
          />
        )}
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScreenHeader back subtitle={`Para ${pet.nombre}`} title="Nuevo cuidado" />
      <CareForm loading={saving} onCancel={() => router.back()} onSubmit={handleSubmit} submitLabel="Guardar cuidado" />
    </AppScreen>
  );
}
