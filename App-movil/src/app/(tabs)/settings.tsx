import { useState } from 'react';
import { Alert } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { Notice } from '@/components/common/Notice';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { HouseholdCard } from '@/components/settings/HouseholdCard';
import { InviteCodeCard } from '@/components/settings/InviteCodeCard';
import { MembersCard } from '@/components/settings/MembersCard';
import { NotificationsCard } from '@/components/settings/NotificationsCard';
import { ProfileCard } from '@/components/settings/ProfileCard';
import { SmartwatchCard } from '@/components/settings/SmartwatchCard';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { getErrorMessage } from '@/utils/errors';

export default function SettingsScreen() {
  const { profile, profileError, refreshProfile, signOut } = useSession();
  const { household, error: householdError, refreshHouseholds } = useHousehold();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([refreshProfile(), refreshHouseholds(household?.id)]);
    } finally {
      setRefreshing(false);
    }
  }

  function confirmLogout() {
    Alert.alert('Cerrar sesión', 'Se cancelarán los recordatorios de este teléfono.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () =>
          void signOut().catch((error: unknown) => {
            Alert.alert('No se pudo cerrar sesión', getErrorMessage(error));
          }),
      },
    ]);
  }

  return (
    <AppScreen onRefresh={() => void refresh()} refreshing={refreshing}>
      <ScreenHeader subtitle="Tu perfil, tu hogar y tus avisos." title="Ajustes" />
      {profileError ? <Notice tone="error">{profileError}</Notice> : null}
      {householdError ? <Notice tone="error">{householdError}</Notice> : null}
      <ProfileCard key={`perfil-${profile?.id ?? 'sin-perfil'}`} />
      <HouseholdCard key={`hogar-${household?.id ?? 'sin-hogar'}`} />
      <MembersCard />
      <InviteCodeCard />
      <NotificationsCard />
      <SmartwatchCard />
      <AppButton icon="log-out-outline" onPress={confirmLogout} variant="danger">
        Cerrar sesión
      </AppButton>
    </AppScreen>
  );
}
