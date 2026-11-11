import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { EmptyState } from '@/components/common/EmptyState';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { LoadingScreen, UnavailableScreen } from '@/components/common/ScreenStates';
import { IncidentForm, type IncidentFormValues } from '@/components/incidents/IncidentForm';
import { describeVetSuggestion } from '@/components/incidents/VetSuggestionCard';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useFocusData } from '@/hooks/useFocusData';
import { useSaving } from '@/hooks/useSaving';
import { createIncident, getIncidents } from '@/services/incidents';
import { getPets } from '@/services/pets';
import { newId } from '@/utils/ids';
import { getVetSuggestions, getVetSuggestionWindowStart } from '@/utils/incidents';

export default function AddIncidentScreen() {
  const { petId } = useLocalSearchParams<{ petId?: string }>();
  const { household } = useHousehold();
  const householdId = household?.id ?? null;
  // El mismo id en reintentos de esta pantalla: si la red falla, no se duplica.
  const [incidentId] = useState(() => newId());
  const loader = useMemo(() => (householdId ? async () => (await getPets(householdId)).filter((pet) => pet.activa) : null), [householdId]);
  const { data: pets, error, loading, refresh, refreshing } = useFocusData(loader, {
    errorMessage: 'No se pudieron cargar las mascotas.',
    resetKey: householdId ?? 'sin-hogar',
  });
  const { saving, run } = useSaving();

  if (loading) return <LoadingScreen />;
  if (!pets) {
    return (
      <UnavailableScreen
        error={error}
        message="No hay un hogar activo."
        onRetry={() => void refresh()}
        retrying={refreshing}
        title="Registrar incidente"
      />
    );
  }

  function handleSubmit(values: IncidentFormValues) {
    return run(async () => {
      const incident = await createIncident({ id: incidentId, ...values });
      const now = Date.now();
      const recent = await getIncidents(incident.hogar_id, {
        petId: incident.mascota_id,
        sinceIso: getVetSuggestionWindowStart(now),
      }).catch(() => []);
      const suggestion = getVetSuggestions(recent, now).find((item) => item.tipo === incident.tipo);
      const petName = pets?.find((pet) => pet.id === incident.mascota_id)?.nombre ?? 'Tu mascota';

      if (suggestion) {
        Alert.alert('Incidente registrado', `${describeVetSuggestion(suggestion, petName)}\n\nLos demás miembros lo verán en tiempo real.`, [
          { text: 'Entendido', style: 'cancel', onPress: () => router.back() },
          {
            text: 'Registrar visita',
            onPress: () => router.replace({ pathname: '/vet-visit/add', params: { petId: incident.mascota_id } }),
          },
        ]);
      } else {
        router.back();
      }
    }, 'No se pudo registrar el incidente');
  }

  return (
    <AppScreen>
      <ScreenHeader back subtitle="Los demás miembros del hogar lo verán en tiempo real." title="Registrar incidente" />
      {pets.length ? (
        <IncidentForm
          initialPetId={typeof petId === 'string' ? petId : null}
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
