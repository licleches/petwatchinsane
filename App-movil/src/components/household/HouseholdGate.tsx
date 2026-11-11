import { router } from 'expo-router';
import { type PropsWithChildren, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { getConfiguredTimeZone } from '@/constants/options';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { createHousehold } from '@/services/households';
import { spacing } from '@/theme/colors';
import { getErrorMessage } from '@/utils/errors';

/** Muestra las pestañas solo cuando hay un hogar activo; si no, carga, error o alta de hogar. */
export function HouseholdGate({ children }: PropsWithChildren) {
  const { household, isLoading, error, refreshHouseholds } = useHousehold();
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      await refreshHouseholds();
    } finally {
      setRetrying(false);
    }
  }

  if (household) return <>{children}</>;
  if (isLoading) {
    return (
      <AppScreen scroll={false}>
        <LoadingState label="Cargando tu hogar..." />
      </AppScreen>
    );
  }
  if (error) {
    return (
      <AppScreen>
        <ErrorState message={error} onRetry={() => void retry()} retrying={retrying} />
      </AppScreen>
    );
  }
  return <NoHouseholdScreen />;
}

function NoHouseholdScreen() {
  const { displayName, profile, signOut } = useSession();
  const { refreshHouseholds } = useHousehold();
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const householdId = await createHousehold(`Hogar de ${displayName}`.slice(0, 80), getConfiguredTimeZone(profile?.zona_horaria));
      await refreshHouseholds(householdId);
    } catch (error) {
      Alert.alert('No se pudo crear el hogar', getErrorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  async function logout() {
    try {
      await signOut();
    } catch (error) {
      Alert.alert('No se pudo cerrar sesión', getErrorMessage(error));
    }
  }

  return (
    <AppScreen>
      <EmptyState
        icon="home-outline"
        message="Crea tu hogar para registrar a tus mascotas o únete al de tu familia con un código de invitación."
        title="Aún no tienes un hogar"
      />
      <View style={styles.actions}>
        <AppButton icon="add-circle-outline" loading={creating} onPress={() => void create()}>
          Crear mi hogar
        </AppButton>
        <AppButton icon="enter-outline" onPress={() => router.push('/household/join')} variant="secondary">
          Unirme con un código
        </AppButton>
        <AppButton onPress={() => void logout()} variant="ghost">
          Cerrar sesión
        </AppButton>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
});
