import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/contexts/SessionContext';

export default function AuthLayout() {
  const { isLoading, session } = useSession();
  if (isLoading) return null;
  // Al iniciar sesión o registrarse, esta redirección lleva a las pestañas.
  if (session) return <Redirect href="/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
