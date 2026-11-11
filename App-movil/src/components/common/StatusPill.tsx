import { StyleSheet, Text, View } from 'react-native';

import { TASK_STATUS_LABELS } from '@/constants/options';
import type { TaskStatus } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';

export function StatusPill({ status, overdue = false }: { status: TaskStatus; overdue?: boolean }) {
  const tone = status === 'hecha' ? 'success' : status === 'omitida' ? 'error' : overdue ? 'alert' : 'neutral';
  const textStyle =
    tone === 'success' ? styles.successText : tone === 'error' ? styles.errorText : tone === 'alert' ? styles.alertText : styles.neutralText;
  const label = status === 'pendiente' && overdue ? 'Atrasada' : TASK_STATUS_LABELS[status];
  return (
    <View style={[styles.pill, styles[tone]]}>
      <Text style={[styles.label, textStyle]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  success: { backgroundColor: colors.successSoft },
  error: { backgroundColor: colors.errorSoft },
  alert: { backgroundColor: colors.alertSoft },
  neutral: { backgroundColor: colors.border },
  label: { fontSize: 12, fontWeight: '700' },
  successText: { color: colors.success },
  errorText: { color: colors.errorText },
  alertText: { color: colors.alertText },
  neutralText: { color: colors.text },
});
