import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { IconName } from '@/constants/options';
import { colors, radius, spacing } from '@/theme/colors';

export function EmptyState({
  icon = 'paw-outline',
  title,
  message,
  action,
  compact = false,
}: {
  icon?: IconName;
  title: string;
  message: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <View style={[styles.container, compact && styles.compact]}>
      <View style={[styles.iconCircle, compact && styles.compactIcon]}>
        <Ionicons color={colors.primary} name={icon} size={compact ? 24 : 32} />
      </View>
      <Text style={[styles.title, compact && styles.compactTitle]}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  compact: { padding: spacing.md },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: colors.softPrimary,
    borderRadius: radius.pill,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  compactIcon: { height: 52, width: 52 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  compactTitle: { fontSize: 17 },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  action: { marginTop: spacing.sm, minWidth: 190 },
});
