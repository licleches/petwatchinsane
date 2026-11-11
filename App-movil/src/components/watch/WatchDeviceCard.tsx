import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import { Tag } from '@/components/common/Tag';
import type { WatchDevice } from '@/types/watch';
import { colors, spacing } from '@/theme/colors';
import { formatDateTime } from '@/utils/dates';

function maskedIdentifier(identifier: string | null) {
  if (!identifier) return null;
  if (identifier.length <= 8) return identifier;
  return `${identifier.slice(0, 4)}...${identifier.slice(-4)}`;
}

export function WatchDeviceCard({
  device,
  timeZone,
  loading = false,
  onUnlink,
}: {
  device: WatchDevice;
  timeZone: string;
  loading?: boolean;
  onUnlink: () => void;
}) {
  const identifier = maskedIdentifier(device.identifier);
  const linked = device.status === 'linked';
  return (
    <Card>
      <View style={styles.header}>
        <Ionicons color={colors.primary} name="watch-outline" size={24} />
        <Text style={styles.title}>{device.name || 'Smartwatch'}</Text>
        <Tag label={linked ? 'Vinculado' : 'Pendiente'} tone={linked ? 'success' : 'warning'} />
      </View>
      {device.type ? <Text style={styles.detail}>Tipo: {device.type === 'wear_os' ? 'Wear OS' : device.type}</Text> : null}
      {linked && device.linkedAt ? <Text style={styles.detail}>Vinculado: {formatDateTime(device.linkedAt, timeZone)}</Text> : null}
      {device.lastSyncedAt ? <Text style={styles.detail}>Última conexión: {formatDateTime(device.lastSyncedAt, timeZone)}</Text> : null}
      {identifier ? <Text style={styles.detail}>Identificador: {identifier}</Text> : null}
      {!linked ? (
        <Text style={styles.hint}>
          Abre PetWatch en el reloj para que termine de conectarse. Si no lo hace en 5 minutos, desvincúlalo y genera un código nuevo.
        </Text>
      ) : null}
      <View style={styles.action}>
        <AppButton compact disabled={loading} icon="unlink-outline" loading={loading} onPress={onUnlink} variant="danger">
          Desvincular
        </AppButton>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  title: { color: colors.text, flex: 1, fontSize: 17, fontWeight: '800' },
  detail: { color: colors.muted, fontSize: 13, marginTop: 4 },
  hint: { color: colors.alertText, fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  action: { marginTop: spacing.md },
});
