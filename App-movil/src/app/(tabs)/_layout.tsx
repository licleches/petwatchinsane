import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HouseholdGate } from '@/components/household/HouseholdGate';
import { useSession } from '@/contexts/SessionContext';
import { colors } from '@/theme/colors';

export default function TabsLayout() {
  const { isLoading, session } = useSession();
  const insets = useSafeAreaInsets();
  if (isLoading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <HouseholdGate>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
          tabBarStyle: {
            borderTopColor: colors.border,
            height: 60 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: 8,
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Hoy',
            href: '/(tabs)',
            tabBarIcon: ({ color, size }) => <Ionicons color={String(color)} name="today-outline" size={size} />,
          }}
        />
        <Tabs.Screen
          name="pets"
          options={{
            title: 'Mascotas',
            tabBarIcon: ({ color, size }) => <Ionicons color={String(color)} name="paw-outline" size={size} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'Historial',
            tabBarIcon: ({ color, size }) => <Ionicons color={String(color)} name="time-outline" size={size} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Ajustes',
            tabBarIcon: ({ color, size }) => <Ionicons color={String(color)} name="settings-outline" size={size} />,
          }}
        />
      </Tabs>
    </HouseholdGate>
  );
}
