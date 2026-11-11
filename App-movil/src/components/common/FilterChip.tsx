import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { IconName } from '@/constants/options';
import { colors, radius, spacing } from '@/theme/colors';

export function FilterChip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}>
      {icon ? <Ionicons color={selected ? colors.primary : colors.muted} name={icon} size={15} /> : null}
      <Text style={[styles.text, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: spacing.sm + 4,
  },
  selected: { backgroundColor: colors.softPrimary, borderColor: colors.secondary },
  text: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  selectedText: { color: colors.primaryDark },
});
