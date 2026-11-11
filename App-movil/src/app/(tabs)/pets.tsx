import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { PetCard } from '@/components/pets/PetCard';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useFocusData } from '@/hooks/useFocusData';
import { useTodayKey } from '@/hooks/useNow';
import { getPets } from '@/services/pets';
import { colors, spacing } from '@/theme/colors';

export default function PetsScreen() {
  const { household, timeZone } = useHousehold();
  const householdId = household?.id ?? null;
  const todayKey = useTodayKey(timeZone);
  const loader = useMemo(() => (householdId ? () => getPets(householdId) : null), [householdId]);
  const { data: pets, error, loading, refreshing, refresh } = useFocusData(loader, {
    errorMessage: 'No se pudieron cargar las mascotas.',
    resetKey: householdId ?? 'sin-hogar',
  });

  const active = (pets ?? []).filter((pet) => pet.activa);
  const archived = (pets ?? []).filter((pet) => !pet.activa);
  const openPet = (petId: string) => router.push({ pathname: '/pet/[id]', params: { id: petId } });

  return (
    <AppScreen onRefresh={() => void refresh()} refreshing={refreshing}>
      <ScreenHeader
        action={
          <AppButton compact icon="add" onPress={() => router.push('/pet/add')}>
            Agregar
          </AppButton>
        }
        subtitle={household?.nombre}
        title="Mascotas"
      />
      {loading ? <LoadingState label="Cargando mascotas..." /> : null}
      {!loading && error && !pets ? <ErrorState message={error} onRetry={() => void refresh()} retrying={refreshing} /> : null}
      {pets ? (
        <>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {!active.length ? (
            <EmptyState
              action={<AppButton onPress={() => router.push('/pet/add')}>Agregar mascota</AppButton>}
              message={
                archived.length
                  ? 'Todas tus mascotas están archivadas. Agrega una nueva o reactiva alguna desde su ficha.'
                  : 'Registra a tu primera mascota para organizar sus comidas, medicamentos, paseos y salud.'
              }
              title={archived.length ? 'No hay mascotas activas' : 'Aún no tienes mascotas'}
            />
          ) : (
            <View style={styles.list}>
              {active.map((pet) => (
                <PetCard key={pet.id} onPress={() => openPet(pet.id)} pet={pet} todayKey={todayKey} />
              ))}
            </View>
          )}
          {archived.length ? (
            <View style={styles.list}>
              <Text style={styles.sectionTitle}>Archivadas</Text>
              {archived.map((pet) => (
                <PetCard key={pet.id} onPress={() => openPet(pet.id)} pet={pet} todayKey={todayKey} />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: spacing.sm },
});
