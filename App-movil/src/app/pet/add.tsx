import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';

import { AppScreen } from '@/components/common/AppScreen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { PetForm } from '@/components/pets/PetForm';
import { useHousehold } from '@/contexts/HouseholdContext';
import type { PhotoChange } from '@/services/petPhotos';
import { createPet, type PetInput } from '@/services/pets';
import { getErrorMessage } from '@/utils/errors';

export default function AddPetScreen() {
  const { household } = useHousehold();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function handleSubmit(input: PetInput, photo: PhotoChange) {
    if (savingRef.current) return;
    if (!household) {
      Alert.alert('Sin hogar activo', 'Elige o crea un hogar en Ajustes antes de agregar mascotas.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const { pet, photoError } = await createPet(household.id, input, photo);
      const openPet = () => router.replace({ pathname: '/pet/[id]', params: { id: pet.id } });
      if (photoError) {
        Alert.alert('Mascota guardada', `${pet.nombre} se guardó, pero la foto no se pudo subir. ${photoError}`, [
          { text: 'Continuar', onPress: openPet },
        ]);
      } else {
        openPet();
      }
    } catch (error) {
      Alert.alert('No se pudo guardar', getErrorMessage(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <AppScreen>
      <ScreenHeader back subtitle={household ? `Se agregará a ${household.nombre}.` : undefined} title="Nueva mascota" />
      <PetForm loading={saving} onCancel={() => router.back()} onSubmit={handleSubmit} submitLabel="Guardar mascota" />
    </AppScreen>
  );
}
