import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { IncidentAlertController } from '@/components/notifications/IncidentAlertController';
import { NotificationController } from '@/components/notifications/NotificationController';
import { HouseholdProvider } from '@/contexts/HouseholdContext';
import { SessionProvider, useSession } from '@/contexts/SessionContext';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <SessionProvider>
      <HouseholdProvider>
        <StatusBar style="dark" />
        <SplashController />
        <NotificationController />
        <IncidentAlertController />
        <RootNavigator />
      </HouseholdProvider>
    </SessionProvider>
  );
}

function SplashController() {
  const { isLoading } = useSession();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [isLoading]);

  return null;
}

function RootNavigator() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="household" />
      <Stack.Screen name="pet" />
      <Stack.Screen name="care" />
      <Stack.Screen name="vaccine" />
      <Stack.Screen name="vet-visit" />
      <Stack.Screen name="incident" />
      <Stack.Screen name="walk" />
      <Stack.Screen name="watch" />
    </Stack>
  );
}
