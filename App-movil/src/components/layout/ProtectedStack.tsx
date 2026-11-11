import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/contexts/SessionContext';

/** Stack para rutas que requieren sesión (igual que los _layout protegidos de MedTime). */
export function ProtectedStack() {
  const { isLoading, session } = useSession();
  if (isLoading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
