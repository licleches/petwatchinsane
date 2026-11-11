import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WatchOriginBadge } from '@/components/watch/WatchOriginBadge';
import { colors, radius, spacing } from '@/theme/colors';
import type { HistoryEntry, HistoryTone } from '@/utils/history';

const tonePalette: Record<HistoryTone, { background: string; foreground: string }> = {
  success: { background: colors.successSoft, foreground: colors.success },
  error: { background: colors.errorSoft, foreground: colors.error },
  warning: { background: colors.alertSoft, foreground: colors.alertText },
  info: { background: colors.blueSoft, foreground: colors.blue },
  primary: { background: colors.softPrimary, foreground: colors.primary },
  neutral: { background: colors.border, foreground: colors.muted },
};

export function TimelineItem({ entry, isLast, onPress }: { entry: HistoryEntry; isLast: boolean; onPress: () => void }) {
  const palette = tonePalette[entry.tone];
  return (
    <Pressable
      accessibilityLabel={`${entry.title}. ${entry.subtitle ?? ''}${entry.fromWatch ? ' Registrado desde el reloj.' : ''}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: palette.background }]}>
          <Ionicons color={palette.foreground} name={entry.icon} size={16} />
        </View>
        {!isLast ? <View style={styles.line} /> : null}
      </View>
      <View style={[styles.copy, !isLast && styles.copySpacing]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{entry.title}</Text>
          <Text style={styles.time}>{entry.timeLabel}</Text>
        </View>
        {entry.subtitle ? (
          <Text numberOfLines={3} style={styles.subtitle}>
            {entry.subtitle}
          </Text>
        ) : null}
        {entry.fromWatch ? (
          <View style={styles.badge}>
            <WatchOriginBadge />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: spacing.sm },
  pressed: { opacity: 0.7 },
  rail: { alignItems: 'center', width: 32 },
  dot: { alignItems: 'center', borderRadius: radius.pill, height: 32, justifyContent: 'center', width: 32 },
  line: { backgroundColor: colors.border, flex: 1, marginVertical: 2, width: 2 },
  copy: { flex: 1, paddingTop: 4 },
  copySpacing: { paddingBottom: spacing.md },
  titleRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  title: { color: colors.text, flex: 1, fontSize: 15, fontWeight: '800' },
  time: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  badge: { marginTop: spacing.xs },
});
