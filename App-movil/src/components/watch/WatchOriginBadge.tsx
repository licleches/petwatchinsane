import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/colors';
import { WATCH_ORIGIN_LABEL } from '@/utils/watch';

/** Distintivo para paseos, incidentes y tareas que vienen del smartwatch. */
export function WatchOriginBadge() {
  return (
    <View accessibilityLabel="Registrado desde el reloj" style={styles.badge}>
      <Text style={styles.text}>{WATCH_ORIGIN_LABEL}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.blueSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  text: { color: colors.blue, fontSize: 12, fontWeight: '700' },
});
