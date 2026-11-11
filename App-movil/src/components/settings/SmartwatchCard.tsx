import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import { Tag, type TagTone } from '@/components/common/Tag';
import { SettingsCardTitle } from '@/components/settings/SettingsParts';
import { useSession } from '@/contexts/SessionContext';
import { useFocusData } from '@/hooks/useFocusData';
import { getWatchConnection } from '@/services/watchService';
import type { WatchConnection } from '@/types/watch';
import { colors, spacing } from '@/theme/colors';

function describeConnection(connection: WatchConnection): { label: string; tone: TagTone; detail: string } {
  const linked = connection.devices.filter((device) => device.status === 'linked');
  switch (connection.state) {
    case 'linked':
      return {
        label: 'Vinculado',
        tone: 'success',
        detail: linked.length === 1 ? linked[0].name || 'Smartwatch' : `${linked.length} relojes vinculados`,
      };
    case 'pending':
      return { label: 'Pendiente', tone: 'warning', detail: 'Abre PetWatch en el reloj para terminar.' };
    case 'not_configured':
      return { label: 'Sin configurar', tone: 'neutral', detail: 'Falta desplegar el backend del reloj.' };
    case 'no_device':
      return { label: 'Sin reloj', tone: 'neutral', detail: 'Aún no vinculas un reloj.' };
    default:
      return { label: 'Error', tone: 'error', detail: connection.message };
  }
}

/** Acceso a la pantalla de vinculación (reemplaza la tarjeta "Smartwatch — Próximamente"). */
export function SmartwatchCard() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const loader = useMemo(() => (userId ? () => getWatchConnection(userId) : null), [userId]);
  const { data: connection, error, loading } = useFocusData(loader, {
    errorMessage: 'No se pudo consultar el reloj.',
    resetKey: userId ?? 'sin-usuario',
  });
  const status = connection ? describeConnection(connection) : null;
  const hasDevices = Boolean(connection?.devices.length);

  return (
    <Card>
      <SettingsCardTitle
        action={status ? <Tag label={status.label} tone={status.tone} /> : null}
        icon="watch-outline"
        subtitle="Wear OS: avisos, paseos con GPS e incidentes rápidos."
        title="Smartwatch"
      />
      <View style={styles.content}>
        <Text style={styles.status}>
          {loading ? 'Consultando el reloj...' : status ? status.detail : error ?? 'No se pudo consultar el reloj.'}
        </Text>
        <AppButton icon="watch-outline" onPress={() => router.push('/watch/connect')} variant={hasDevices ? 'secondary' : 'primary'}>
          {hasDevices ? 'Administrar reloj' : 'Vincular reloj'}
        </AppButton>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  status: { color: colors.muted, fontSize: 14, lineHeight: 20 },
});
