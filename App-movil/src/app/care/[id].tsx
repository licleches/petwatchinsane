import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { CareForm } from '@/components/care/CareForm';
import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { useFocusData } from '@/hooks/useFocusData';
import { type CareInput, getCare, saveCare, setCareActive } from '@/services/cares';
import { requestTaskNotificationSync } from '@/services/notifications';
import { getPet } from '@/services/pets';
import { colors, spacing } from '@/theme/colors';
import { getErrorMessage } from '@/utils/errors';

export default function EditCareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const careId = typeof id === 'string' ? id : null;
  const { user } = useSession();
  const { households } = useHousehold();
  const loader = useMemo(
    () =>
      careId
        ? async () => {
            const care = await getCare(careId);
            if (!care) return null;
            const pet = await getPet(care.mascota_id);
            return pet ? { care, pet } : null;
          }
        : null,
    [careId],
  );
  const { data, error, loading, refresh, refreshing } = useFocusData(loader, {
    errorMessage: 'No se pudo cargar el cuidado.',
    resetKey: careId ?? 'sin-id',
  });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function runSaving(action: () => Promise<void>, errorTitle: string) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await action();
      if (user) requestTaskNotificationSync(user.id, households);
      router.back();
    } catch (actionError) {
      Alert.alert(errorTitle, getErrorMessage(actionError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleSubmit(input: CareInput) {
    if (!data) return Promise.resolve();
    return runSaving(async () => {
      await saveCare(data.pet.id, data.pet.hogar_id, input, data.care.id);
    }, 'No se pudo guardar');
  }

  function confirmPause() {
    if (!data) return;
    Alert.alert('Pausar cuidado', 'Se borrarán sus tareas futuras. El historial se conserva y puedes reanudarlo cuando quieras.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Pausar',
        style: 'destructive',
        onPress: () =>
          void runSaving(async () => {
            await setCareActive(data.care.id, data.pet.hogar_id, false);
          }, 'No se pudo pausar'),
      },
    ]);
  }

  if (loading) {
    return (
      <AppScreen scroll={false}>
        <LoadingState label="Cargando cuidado..." />
      </AppScreen>
    );
  }
  if (!data) {
    return (
      <AppScreen>
        <ScreenHeader back title="Cuidado" />
        {error ? (
          <ErrorState message={error} onRetry={() => void refresh()} retrying={refreshing} />
        ) : (
          <EmptyState
            action={<AppButton onPress={() => router.back()}>Volver</AppButton>}
            message="No encontramos este cuidado."
            title="Cuidado no disponible"
          />
        )}
      </AppScreen>
    );
  }

  const { care, pet } = data;
  return (
    <AppScreen>
      <ScreenHeader back subtitle={`${care.nombre} · ${pet.nombre}`} title="Editar cuidado" />
      {!care.activo ? <Notice tone="warning">Este cuidado está pausado y no genera tareas.</Notice> : null}
      {!pet.activa ? <Notice tone="warning">La mascota está archivada: sus cuidados no generan tareas.</Notice> : null}
      <CareForm initial={care} key={care.id} loading={saving} onCancel={() => router.back()} onSubmit={handleSubmit} submitLabel="Guardar cambios" />
      <View style={styles.danger}>
        {care.activo ? (
          <AppButton disabled={saving} icon="pause-outline" onPress={confirmPause} variant="danger">
            Pausar cuidado
          </AppButton>
        ) : (
          <AppButton
            disabled={!pet.activa}
            icon="play-outline"
            loading={saving}
            onPress={() =>
              void runSaving(async () => {
                await setCareActive(care.id, pet.hogar_id, true);
              }, 'No se pudo reanudar')
            }>
            Reanudar cuidado
          </AppButton>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  danger: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.sm, paddingTop: spacing.lg },
});
