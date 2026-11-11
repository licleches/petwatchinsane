import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import type { IconName } from '@/constants/options';
import type { WatchConnectionState } from '@/types/watch';
import { colors, radius, spacing } from '@/theme/colors';

type Tone = 'info' | 'success' | 'warning' | 'error';

const statusCopy: Record<WatchConnectionState, { icon: IconName; title: string; tone: Tone }> = {
  no_device: { icon: 'watch-outline', title: 'Sin reloj vinculado', tone: 'info' },
  pending: { icon: 'time-outline', title: 'Vinculación pendiente', tone: 'warning' },
  linked: { icon: 'checkmark-circle-outline', title: 'Reloj vinculado', tone: 'success' },
  error: { icon: 'alert-circle-outline', title: 'Error de conexión', tone: 'error' },
  not_configured: { icon: 'construct-outline', title: 'Backend del reloj sin configurar', tone: 'info' },
};

const toneColors: Record<Tone, { background: string; icon: string }> = {
  info: { background: colors.softPrimary, icon: colors.primary },
  success: { background: colors.successSoft, icon: colors.success },
  warning: { background: colors.alertSoft, icon: colors.alert },
  error: { background: colors.errorSoft, icon: colors.error },
};

export function WatchStatusCard({
  state,
  message,
  loading = false,
  onRefresh,
}: {
  state: WatchConnectionState;
  message: string;
  loading?: boolean;
  onRefresh: () => void;
}) {
  const copy = statusCopy[state];
  const palette = toneColors[copy.tone];
  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: palette.background }]}>
          <Ionicons color={palette.icon} name={copy.icon} size={24} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
      <AppButton compact disabled={loading} icon="refresh-outline" loading={loading} onPress={onRefresh} variant="secondary">
        Actualizar estado
      </AppButton>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  icon: { alignItems: 'center', borderRadius: radius.pill, height: 48, justifyContent: 'center', width: 48 },
  copy: { flex: 1 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  message: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
});
