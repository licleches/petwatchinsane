import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { PetForm } from '@/components/pets/PetForm';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { useFocusData } from '@/hooks/useFocusData';
import { requestTaskNotificationSync } from '@/services/notifications';
import type { PhotoChange } from '@/services/petPhotos';
import { getPet, type PetInput, setPetActive, updatePet } from '@/services/pets';
import { generateTasks } from '@/services/tasks';
import { colors, spacing } from '@/theme/colors';
import { getErrorMessage } from '@/utils/errors';

export default function EditPetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const petId = typeof id === 'string' ? id : null;
  const { user } = useSession();
  const { households } = useHousehold();
  const loader = useMemo(() => (petId ? () => getPet(petId) : null), [petId]);
  const { data: pet, error, loading, refresh, refreshing } = useFocusData(loader, {
    errorMessage: 'No se pudo cargar la mascota.',
    resetKey: petId ?? 'sin-id',
  });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function handleSubmit(input: PetInput, photo: PhotoChange) {
    if (!pet || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const { photoError } = await updatePet(pet, input, photo);
      if (photoError) {
        Alert.alert('Cambios guardados', `Los datos se guardaron, pero la foto no se pudo subir. ${photoError}`, [
          { text: 'Continuar', onPress: () => router.back() },
        ]);
      } else {
        router.back();
      }
    } catch (saveError) {
      Alert.alert('No se pudo guardar', getErrorMessage(saveError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function changeActive(active: boolean) {
    if (!pet || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await setPetActive(pet.id, active);
      // Al reactivar se vuelven a crear sus tareas; al archivar el trigger borra las futuras.
      if (active) await generateTasks(pet.hogar_id);
      if (user) requestTaskNotificationSync(user.id, households);
      router.back();
    } catch (toggleError) {
      Alert.alert(active ? 'No se pudo reactivar' : 'No se pudo archivar', getErrorMessage(toggleError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function confirmArchive() {
    if (!pet) return;
    Alert.alert(
      'Archivar mascota',
      `${pet.nombre} dejará de aparecer en Hoy y se borrarán sus tareas futuras. Su historial se conserva y puedes reactivarla cuando quieras.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Archivar', style: 'destructive', onPress: () => void changeActive(false) },
      ],
    );
  }

  if (loading) {
    return (
      <AppScreen scroll={false}>
        <LoadingState label="Cargando mascota..." />
      </AppScreen>
    );
  }
  if (!pet) {
    return (
      <AppScreen>
        <ScreenHeader back title="Editar mascota" />
        {error ? (
          <ErrorState message={error} onRetry={() => void refresh()} retrying={refreshing} />
        ) : (
          <EmptyState
            action={<AppButton onPress={() => router.back()}>Volver</AppButton>}
            message="No encontramos esta mascota. Puede que ya no pertenezcas a su hogar."
            title="Mascota no disponible"
          />
        )}
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScreenHeader back subtitle={pet.nombre} title="Editar mascota" />
      <PetForm initial={pet} key={pet.id} loading={saving} onCancel={() => router.back()} onSubmit={handleSubmit} submitLabel="Guardar cambios" />
      <View style={styles.danger}>
        {pet.activa ? (
          <AppButton disabled={saving} icon="archive-outline" onPress={confirmArchive} variant="danger">
            Archivar mascota
          </AppButton>
        ) : (
          <AppButton icon="refresh-outline" loading={saving} onPress={() => void changeActive(true)}>
            Reactivar mascota
          </AppButton>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  danger: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.sm, paddingTop: spacing.lg },
});
