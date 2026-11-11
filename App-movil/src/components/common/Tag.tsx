import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { IconName } from '@/constants/options';
import { colors, radius, spacing } from '@/theme/colors';

export type TagTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info';

const toneColors: Record<TagTone, { background: string; text: string }> = {
  neutral: { background: colors.border, text: colors.text },
  primary: { background: colors.softPrimary, text: colors.primaryDark },
  success: { background: colors.successSoft, text: colors.success },
  warning: { background: colors.alertSoft, text: colors.alertText },
  error: { background: colors.errorSoft, text: colors.errorText },
  info: { background: colors.blueSoft, text: colors.blue },
};

export function Tag({ label, tone = 'neutral', icon }: { label: string; tone?: TagTone; icon?: IconName }) {
  const palette = toneColors[tone];
  return (
    <View style={[styles.tag, { backgroundColor: palette.background }]}>
      {icon ? <Ionicons color={palette.text} name={icon} size={13} /> : null}
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  label: { fontSize: 12, fontWeight: '700' },
});
